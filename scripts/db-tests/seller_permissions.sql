-- Fase 0B: seller / admin / anon permission tests on the live schema.
-- Needs a privileged session (to create a fictitious auth user and SET ROLE).
-- Everything runs in one DO block that ALWAYS ends with RAISE EXCEPTION, so the whole
-- transaction is rolled back: the fictitious users, order and changes never persist.
-- The exception message carries the report ("RESULT ok=<n> fail=<n> ...").
DO $t$
DECLARE
  seller uuid := gen_random_uuid();
  admin_u uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  req uuid;
  n int;
  ok int := 0; bad int := 0; report text := '';
  col text;
  stmt text;
  forbidden text[] := ARRAY[
    $$customer_name = 'X'$$, $$customer_whatsapp = '5511000000000'$$, $$customer_notes = 'x'$$,
    $$original_text = 'x'$$, $$ai_interpretation = '{}'::jsonb$$, $$clarifications = '[{"q":1}]'::jsonb$$,
    $$category = 'x'$$, $$ai_failed = NOT ai_failed$$, $$protocol = 'OO-ZZZZ-ZZZZ'$$, $$store_id = NULL$$,
    $$consent_at = now() - interval '1 day'$$, $$is_test = NOT is_test$$, $$submission_key = gen_random_uuid()$$,
    $$submission_hash = 'x'$$, $$submission_origin = 'x'$$, $$created_at = now() - interval '1 day'$$];
  PROCEDURE_DUMMY int;
BEGIN
  -- Fixture: fictitious users + one fictitious order.
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (seller, 'seller-'||seller||'@test.invalid', 'authenticated', 'authenticated'),
    (admin_u, 'admin-'||admin_u||'@test.invalid', 'authenticated', 'authenticated'),
    (other, 'other-'||other||'@test.invalid', 'authenticated', 'authenticated');
  INSERT INTO public.user_roles (user_id, role) VALUES (seller, 'seller'), (admin_u, 'admin');
  INSERT INTO public.quote_requests (store_id, protocol, customer_name, customer_whatsapp, consent_at, original_text)
    VALUES ((SELECT id FROM stores LIMIT 1), 'OO-TEST-0B00', 'Cliente Teste', '5511999990000', now(), 'pedido teste')
    RETURNING id INTO req;
  INSERT INTO public.request_items (request_id, origin, name) VALUES (req, 'original', 'Item teste');

  ---------------- SELLER ----------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- Allowed
  SELECT count(*) INTO n FROM quote_requests WHERE id = req;
  IF n = 1 THEN ok := ok+1; ELSE bad := bad+1; report := report||' FAIL:seller_read_request'; END IF;
  SELECT count(*) INTO n FROM request_items WHERE request_id = req;
  IF n = 1 THEN ok := ok+1; ELSE bad := bad+1; report := report||' FAIL:seller_read_items'; END IF;
  PERFORM 1 FROM suggested_complements LIMIT 1; PERFORM 1 FROM status_history LIMIT 1; PERFORM 1 FROM followups LIMIT 1;
  ok := ok+1;

  FOREACH stmt IN ARRAY ARRAY[
    $$UPDATE quote_requests SET status = 'preparacao', updated_at = now() WHERE id = $1$$,
    $$UPDATE quote_requests SET internal_notes = 'nota', needs_followup_at = now() WHERE id = $1$$,
    $$UPDATE quote_requests SET last_followup_at = now() WHERE id = $1$$,
    $$INSERT INTO status_history (request_id, from_status, to_status, changed_by) VALUES ($1, 'recebido', 'preparacao', auth.uid())$$,
    $$INSERT INTO followups (request_id, user_id, note) VALUES ($1, auth.uid(), 'retorno')$$] LOOP
    BEGIN
      EXECUTE stmt USING req;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 1 THEN ok := ok+1; ELSE bad := bad+1; report := report||' FAIL:allowed_0rows['||left(stmt,40)||']'; END IF;
    EXCEPTION WHEN OTHERS THEN bad := bad+1; report := report||' FAIL:allowed['||left(stmt,40)||']:'||SQLSTATE;
    END;
  END LOOP;

  -- Forbidden column changes, one by one
  FOREACH col IN ARRAY forbidden LOOP
    BEGIN
      EXECUTE 'UPDATE quote_requests SET '||col||' WHERE id = $1' USING req;
      bad := bad+1; report := report||' FAIL:seller_changed['||col||']';
    EXCEPTION WHEN insufficient_privilege THEN ok := ok+1;
              WHEN OTHERS THEN bad := bad+1; report := report||' FAIL:unexpected['||col||']:'||SQLSTATE;
    END;
  END LOOP;

  -- Forbidden operations (error or 0 rows)
  FOREACH stmt IN ARRAY ARRAY[
    $$DELETE FROM quote_requests WHERE id = $1$$,
    $$INSERT INTO quote_requests (protocol, customer_name, customer_whatsapp, consent_at, original_text) SELECT 'OO-TEST-0B01','x','5511999990000',now(),'x' WHERE $1 IS NOT NULL$$,
    $$UPDATE request_items SET name = 'x' WHERE request_id = $1$$,
    $$DELETE FROM request_items WHERE request_id = $1$$,
    $$INSERT INTO request_items (request_id, origin, name) VALUES ($1, 'original', 'x')$$,
    $$INSERT INTO suggested_complements (request_id, name) VALUES ($1, 'x')$$,
    $$UPDATE association_rules SET explanation = 'x' WHERE $1 IS NOT NULL$$,
    $$INSERT INTO association_rules (category, trigger, complement, explanation) SELECT 'x','x','x','x' WHERE $1 IS NOT NULL$$,
    $$DELETE FROM association_rules WHERE $1 IS NOT NULL$$,
    $$UPDATE app_settings SET ai_enabled = NOT ai_enabled WHERE $1 IS NOT NULL$$,
    $$UPDATE stores SET name = 'x' WHERE $1 IS NOT NULL$$,
    $$INSERT INTO stores (name) SELECT 'x' WHERE $1 IS NOT NULL$$,
    $$INSERT INTO user_roles (user_id, role) SELECT auth.uid(), 'admin' WHERE $1 IS NOT NULL$$,
    $$UPDATE user_roles SET role = 'admin' WHERE $1 IS NOT NULL$$,
    $$DELETE FROM user_roles WHERE $1 IS NOT NULL$$,
    $$INSERT INTO status_history (request_id, to_status, changed_by) VALUES ($1, 'perdido', '00000000-0000-0000-0000-000000000001')$$,
    $$INSERT INTO followups (request_id, user_id) VALUES ($1, '00000000-0000-0000-0000-000000000001')$$] LOOP
    BEGIN
      EXECUTE stmt USING req;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN ok := ok+1; ELSE bad := bad+1; report := report||' FAIL:seller_did['||left(stmt,50)||']'; END IF;
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN ok := ok+1;
              WHEN OTHERS THEN
                IF SQLSTATE = '42501' THEN ok := ok+1; ELSE bad := bad+1; report := report||' FAIL:unexpected['||left(stmt,50)||']:'||SQLSTATE; END IF;
    END;
  END LOOP;

  -- Null auth.uid() alone (authenticated role, no sub) grants no exception.
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  BEGIN
    UPDATE quote_requests SET customer_name = 'Y' WHERE id = req;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN ok := ok+1; ELSE bad := bad+1; report := report||' FAIL:null_uid_changed'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN ok := ok+1;
  END;
  RESET ROLE;

  ---------------- ADMIN ----------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH stmt IN ARRAY ARRAY[
    $$UPDATE quote_requests SET status = 'orcamento_enviado' WHERE id = $1$$,
    $$UPDATE quote_requests SET internal_notes = 'admin', needs_followup_at = NULL WHERE id = $1$$,
    $$UPDATE quote_requests SET is_test = NOT is_test WHERE id = $1$$,
    $$UPDATE quote_requests SET customer_notes = 'admin corrige' WHERE id = $1$$,
    $$UPDATE app_settings SET updated_at = now() WHERE $1 IS NOT NULL$$,
    $$UPDATE association_rules SET active = false WHERE id = (SELECT id FROM association_rules LIMIT 1) AND $1 IS NOT NULL$$,
    $$DELETE FROM quote_requests WHERE id = $1$$] LOOP
    BEGIN
      EXECUTE stmt USING req;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n >= 1 THEN ok := ok+1; ELSE bad := bad+1; report := report||' FAIL:admin_0rows['||left(stmt,40)||']'; END IF;
    EXCEPTION WHEN OTHERS THEN bad := bad+1; report := report||' FAIL:admin['||left(stmt,40)||']:'||SQLSTATE;
    END;
  END LOOP;
  RESET ROLE;

  ---------------- ANON ----------------
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  FOREACH stmt IN ARRAY ARRAY['quote_requests','request_items','suggested_complements','status_history','followups',
                              'association_rules','app_settings','stores','user_roles','ai_usage','submit_log'] LOOP
    BEGIN
      EXECUTE 'SELECT count(*) FROM public.'||stmt INTO n;
      IF n = 0 THEN ok := ok+1; ELSE bad := bad+1; report := report||' FAIL:anon_read['||stmt||']'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN ok := ok+1;
    END;
  END LOOP;
  BEGIN PERFORM public.has_role(seller, 'admin'); bad := bad+1; report := report||' FAIL:anon_has_role';
  EXCEPTION WHEN insufficient_privilege THEN ok := ok+1; END;
  BEGIN PERFORM public.is_staff(seller); bad := bad+1; report := report||' FAIL:anon_is_staff';
  EXCEPTION WHEN insufficient_privilege THEN ok := ok+1; END;
  RESET ROLE;

  RAISE EXCEPTION 'RESULT ok=% fail=%%', ok, bad, report;
END
$t$;
