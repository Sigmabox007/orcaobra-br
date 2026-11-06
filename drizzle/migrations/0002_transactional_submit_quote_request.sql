ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS submission_key uuid;
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS submission_hash text;
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS submission_origin text;
CREATE UNIQUE INDEX IF NOT EXISTS quote_requests_submission_key_key ON public.quote_requests (submission_key);

CREATE OR REPLACE FUNCTION public.submit_quote_request(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  allowed constant text[] := ARRAY['name','whatsapp','notes','original_text','interpretation','clarifications','items','suggestions','ai_failed','submission_key','origin'];
  k text;
  v_key uuid;
  v_origin text;
  v_hash text;
  v_existing record;
  v_limit int;
  v_count int;
  v_store uuid;
  v_protocol text;
  v_id uuid;
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_chars text;
  i int;
  v_items jsonb := COALESCE(payload->'items', '[]'::jsonb);
  v_sugs jsonb := COALESCE(payload->'suggestions', '[]'::jsonb);
  v_clar jsonb := COALESCE(payload->'clarifications', '[]'::jsonb);
  v_rule_count int;
  v_valid_rules int;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;
  FOR k IN SELECT jsonb_object_keys(payload) LOOP
    IF NOT k = ANY(allowed) THEN
      RAISE EXCEPTION 'field_not_allowed' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_key := (payload->>'submission_key')::uuid;
  v_origin := payload->>'origin';
  IF v_key IS NULL OR v_origin IS NULL OR length(v_origin) < 16 OR length(v_origin) > 128 THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(payload->>'name','')) NOT BETWEEN 2 AND 80
     OR length(COALESCE(payload->>'whatsapp','')) NOT BETWEEN 10 AND 20
     OR length(COALESCE(payload->>'notes','')) > 500
     OR length(COALESCE(payload->>'original_text','')) NOT BETWEEN 3 AND 1500
     OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) > 30
     OR jsonb_typeof(v_sugs) <> 'array' OR jsonb_array_length(v_sugs) > 5
     OR jsonb_typeof(v_clar) <> 'array' OR jsonb_array_length(v_clar) > 3
     OR jsonb_typeof(COALESCE(payload->'ai_failed','null'::jsonb)) <> 'boolean'
     OR (payload ? 'interpretation' AND jsonb_typeof(payload->'interpretation') NOT IN ('object','null'))
  THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  -- Content fingerprint: every accepted field except key and origin (jsonb text is canonical: sorted keys).
  v_hash := encode(sha256(convert_to((payload - 'submission_key' - 'origin')::text, 'UTF8')), 'hex');

  -- Serialise attempts from the same origin for the rest of this transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended('oo_submit:' || v_origin, 0));

  -- 1) Recovery before rate limiting.
  SELECT protocol, submission_hash, submission_origin, created_at INTO v_existing
    FROM quote_requests WHERE submission_key = v_key;
  IF FOUND THEN
    IF v_existing.submission_hash = v_hash AND v_existing.submission_origin = v_origin
       AND v_existing.created_at > now() - interval '24 hours' THEN
      RETURN jsonb_build_object('status', 'recovered', 'protocol', v_existing.protocol);
    END IF;
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  -- 2) Authoritative rate limit (under the lock).
  SELECT submits_per_origin_hour INTO v_limit FROM app_settings WHERE id = 1;
  SELECT count(*) INTO v_count FROM submit_log
    WHERE origin_hash = v_origin AND created_at >= now() - interval '1 hour';
  IF v_count >= COALESCE(v_limit, 5) THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;

  -- 3) Suggestions must all point at reviewed + active rules.
  SELECT count(*) INTO v_rule_count FROM jsonb_array_elements(v_sugs);
  SELECT count(*) INTO v_valid_rules
    FROM jsonb_array_elements(v_sugs) s
    JOIN association_rules r ON r.id = (s->>'rule_id')::uuid AND r.reviewed AND r.active;
  IF v_valid_rules <> v_rule_count THEN
    RAISE EXCEPTION 'invalid_rule' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_store FROM stores ORDER BY created_at LIMIT 1;

  -- 4) Insert the order (protocol retried on collision).
  FOR attempt IN 1..5 LOOP
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_chars := '';
    FOR i IN 0..7 LOOP
      v_chars := v_chars || substr(v_alpha, (get_byte(v_bytes, i) % 31) + 1, 1);
    END LOOP;
    v_protocol := 'OO-' || substr(v_chars, 1, 4) || '-' || substr(v_chars, 5, 4);
    BEGIN
      INSERT INTO quote_requests (store_id, protocol, customer_name, customer_whatsapp, customer_notes, consent_at,
        original_text, ai_interpretation, clarifications, category, ai_failed,
        status, is_test, internal_notes, needs_followup_at, last_followup_at,
        submission_key, submission_hash, submission_origin)
      VALUES (v_store, v_protocol, payload->>'name', payload->>'whatsapp', NULLIF(payload->>'notes', ''), now(),
        payload->>'original_text', NULLIF(payload->'interpretation', 'null'::jsonb), v_clar,
        left(payload->'interpretation'->>'category', 20), (payload->>'ai_failed')::boolean,
        'recebido', false, NULL, NULL, NULL,
        v_key, v_hash, v_origin)
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (SELECT 1 FROM quote_requests WHERE submission_key = v_key) THEN
        RAISE;
      END IF;
    END;
  END LOOP;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'protocol_exhausted';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) e WHERE length(btrim(COALESCE(e->>'name',''))) > 120) THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  INSERT INTO request_items (request_id, origin, name, quantity)
  SELECT v_id, 'original', btrim(e->>'name'), NULLIF(e->>'quantity', '')
    FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(e, n)
   WHERE length(btrim(COALESCE(e->>'name', ''))) >= 1
   ORDER BY n;

  INSERT INTO request_items (request_id, origin, name, quantity)
  SELECT v_id, 'complement', r.complement, NULL
    FROM jsonb_array_elements(v_sugs) WITH ORDINALITY AS t(s, n)
    JOIN association_rules r ON r.id = (s->>'rule_id')::uuid
   WHERE (s->>'accepted')::boolean
   ORDER BY n;

  INSERT INTO suggested_complements (request_id, rule_id, name, reason, accepted)
  SELECT v_id, r.id, r.complement, left(s->>'reason', 240), COALESCE((s->>'accepted')::boolean, false)
    FROM jsonb_array_elements(v_sugs) s
    JOIN association_rules r ON r.id = (s->>'rule_id')::uuid;

  INSERT INTO status_history (request_id, from_status, to_status, changed_by, note)
  VALUES (v_id, NULL, 'recebido', NULL, 'Pedido enviado pelo cliente');

  INSERT INTO submit_log (origin_hash) VALUES (v_origin);

  RETURN jsonb_build_object('status', 'created', 'protocol', v_protocol);
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_quote_request(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quote_request(jsonb) TO service_role;