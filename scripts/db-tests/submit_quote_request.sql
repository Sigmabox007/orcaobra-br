-- Integration tests for public.submit_quote_request.
-- Everything runs inside one transaction that is ROLLED BACK: no store data is changed.
-- The sandbox role cannot execute the real function (only service_role can), so the
-- tests run an identical temporary copy (pg_temp.sq) built from the live definition.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/db-tests/submit_quote_request.sql
\set QUIET on
BEGIN;

DO $$ BEGIN
  EXECUTE replace(pg_get_functiondef('public.submit_quote_request(jsonb)'::regprocedure),
                  'public.submit_quote_request', 'pg_temp.sq');
END $$;

CREATE TEMP TABLE t_ok_rule AS SELECT id FROM association_rules WHERE reviewed AND active LIMIT 1;
CREATE TEMP TABLE t_bad_rule AS SELECT id FROM association_rules WHERE NOT active LIMIT 1;

CREATE FUNCTION pg_temp.base(k uuid, o text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'name','Teste Integração','whatsapp','5511999990000','notes','',
    'original_text','Quero 10 caixas de piso 60x60','interpretation',jsonb_build_object('category','pisos','activity','assentar piso','items','[]'::jsonb,'missing_info','[]'::jsonb),
    'clarifications','[]'::jsonb,
    'items',jsonb_build_array(jsonb_build_object('name','Piso 60x60','quantity','10 cx')),
    'suggestions',jsonb_build_array(jsonb_build_object('rule_id',(SELECT id FROM t_ok_rule),'reason','acabamento','accepted',true)),
    'ai_failed',false,'submission_key',k,'origin',o)
$$;

CREATE FUNCTION pg_temp.rows_for(k uuid) RETURNS int LANGUAGE sql AS $$
  SELECT (SELECT count(*) FROM quote_requests WHERE submission_key = k)::int
$$;

CREATE FUNCTION pg_temp.expect_error(p jsonb, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_q int; before_i int; before_s int; before_h int; before_l int;
BEGIN
  SELECT count(*) INTO before_q FROM quote_requests; SELECT count(*) INTO before_i FROM request_items;
  SELECT count(*) INTO before_s FROM suggested_complements; SELECT count(*) INTO before_h FROM status_history;
  SELECT count(*) INTO before_l FROM submit_log;
  BEGIN
    PERFORM pg_temp.sq(p);
    RAISE EXCEPTION 'FAIL %: expected an error', label;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL %' THEN RAISE; END IF;
  END;
  IF before_q <> (SELECT count(*) FROM quote_requests) OR before_i <> (SELECT count(*) FROM request_items)
     OR before_s <> (SELECT count(*) FROM suggested_complements) OR before_h <> (SELECT count(*) FROM status_history)
     OR before_l <> (SELECT count(*) FROM submit_log) THEN
    RAISE EXCEPTION 'FAIL %: partial rows left behind', label;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

DO $$
DECLARE
  o1 text := 'itest-origin-' || md5(random()::text);
  o2 text := 'itest-origin-' || md5(random()::text);
  k uuid := gen_random_uuid();
  r jsonb; r2 jsonb; q record;
BEGIN
  -- Valid order: everything written together.
  r := pg_temp.sq(pg_temp.base(k, o1));
  IF r->>'status' <> 'created' OR r->>'protocol' !~ '^OO-[A-Z2-9]{4}-[A-Z2-9]{4}$' THEN RAISE EXCEPTION 'FAIL valid: %', r; END IF;
  SELECT * INTO q FROM quote_requests WHERE submission_key = k;
  IF q.status <> 'recebido' OR q.is_test OR q.internal_notes IS NOT NULL THEN RAISE EXCEPTION 'FAIL valid: admin fields'; END IF;
  IF (SELECT count(*) FROM request_items WHERE request_id = q.id) <> 2 THEN RAISE EXCEPTION 'FAIL valid: items'; END IF;
  IF (SELECT count(*) FROM suggested_complements WHERE request_id = q.id) <> 1 THEN RAISE EXCEPTION 'FAIL valid: suggestions'; END IF;
  IF (SELECT count(*) FROM status_history WHERE request_id = q.id AND to_status = 'recebido' AND changed_by IS NULL) <> 1 THEN RAISE EXCEPTION 'FAIL valid: history'; END IF;
  IF (SELECT count(*) FROM submit_log WHERE origin_hash = o1) <> 1 THEN RAISE EXCEPTION 'FAIL valid: submit_log'; END IF;
  RAISE NOTICE 'ok  pedido válido gravado por inteiro';

  -- Same key + same content + same origin: same protocol, nothing new.
  r2 := pg_temp.sq(pg_temp.base(k, o1));
  IF r2->>'status' <> 'recovered' OR r2->>'protocol' <> r->>'protocol' OR pg_temp.rows_for(k) <> 1
     OR (SELECT count(*) FROM submit_log WHERE origin_hash = o1) <> 1 THEN RAISE EXCEPTION 'FAIL recover: %', r2; END IF;
  RAISE NOTICE 'ok  mesma chave e conteúdo devolve o mesmo protocolo';

  -- Same key, different content: rejected, no protocol.
  r2 := pg_temp.sq(jsonb_set(pg_temp.base(k, o1), '{original_text}', '"Outro pedido diferente"'));
  IF r2->>'status' <> 'rejected' OR r2 ? 'protocol' THEN RAISE EXCEPTION 'FAIL conflict text: %', r2; END IF;
  r2 := pg_temp.sq(jsonb_set(pg_temp.base(k, o1), '{whatsapp}', '"5511988887777"'));
  IF r2->>'status' <> 'rejected' OR r2 ? 'protocol' THEN RAISE EXCEPTION 'FAIL conflict phone: %', r2; END IF;
  r2 := pg_temp.sq(jsonb_set(pg_temp.base(k, o1), '{items,0,quantity}', '"99 cx"'));
  IF r2->>'status' <> 'rejected' OR r2 ? 'protocol' THEN RAISE EXCEPTION 'FAIL conflict item: %', r2; END IF;
  RAISE NOTICE 'ok  mesma chave com conteúdo diferente é recusada';

  -- Same key + content from another origin: no protocol, no data.
  r2 := pg_temp.sq(pg_temp.base(k, o2));
  IF r2->>'status' <> 'rejected' OR r2 ? 'protocol' OR (SELECT count(*) FROM submit_log WHERE origin_hash = o2) <> 0 THEN RAISE EXCEPTION 'FAIL other origin: %', r2; END IF;
  RAISE NOTICE 'ok  outra origem não recupera o pedido';

  -- Older than 24h: recovery refused.
  UPDATE quote_requests SET created_at = now() - interval '25 hours' WHERE submission_key = k;
  r2 := pg_temp.sq(pg_temp.base(k, o1));
  IF r2->>'status' <> 'rejected' OR r2 ? 'protocol' THEN RAISE EXCEPTION 'FAIL 24h: %', r2; END IF;
  UPDATE quote_requests SET created_at = now() WHERE submission_key = k;
  RAISE NOTICE 'ok  recuperação recusada após 24 horas';

  -- Scenario A: origin at its limit can still recover its own order.
  INSERT INTO submit_log (origin_hash) SELECT o1 FROM generate_series(1, 10);
  r2 := pg_temp.sq(pg_temp.base(k, o1));
  IF r2->>'status' <> 'recovered' OR r2->>'protocol' <> r->>'protocol' OR (SELECT count(*) FROM submit_log WHERE origin_hash = o1) <> 11 THEN RAISE EXCEPTION 'FAIL scenario A: %', r2; END IF;
  RAISE NOTICE 'ok  cenário A: limite esgotado, recuperação devolve o protocolo';

  -- Scenario B: same origin at its limit, new key: blocked, nothing written.
  k := gen_random_uuid();
  r2 := pg_temp.sq(pg_temp.base(k, o1));
  IF r2->>'status' <> 'rate_limited' OR r2 ? 'protocol' OR pg_temp.rows_for(k) <> 0 OR (SELECT count(*) FROM submit_log WHERE origin_hash = o1) <> 11 THEN RAISE EXCEPTION 'FAIL scenario B: %', r2; END IF;
  RAISE NOTICE 'ok  cenário B: limite esgotado, pedido novo bloqueado';

  -- Forbidden / unknown fields.
  PERFORM pg_temp.expect_error(pg_temp.base(gen_random_uuid(), o2) || '{"status":"convertido"}', 'campo status recusado');
  PERFORM pg_temp.expect_error(pg_temp.base(gen_random_uuid(), o2) || '{"is_test":true}', 'campo is_test recusado');
  PERFORM pg_temp.expect_error(pg_temp.base(gen_random_uuid(), o2) || '{"internal_notes":"x"}', 'campo internal_notes recusado');
  PERFORM pg_temp.expect_error(pg_temp.base(gen_random_uuid(), o2) || jsonb_build_object('store_id', gen_random_uuid()), 'campo store_id recusado');
  PERFORM pg_temp.expect_error(pg_temp.base(gen_random_uuid(), o2) || '{"changed_by":"x"}', 'campo changed_by recusado');
  PERFORM pg_temp.expect_error(pg_temp.base(gen_random_uuid(), o2) || '{"role":"admin"}', 'campo desconhecido recusado');

  -- Simulated failures at each stage leave nothing behind.
  PERFORM pg_temp.expect_error(jsonb_set(pg_temp.base(gen_random_uuid(), o2), '{suggestions,0,rule_id}', to_jsonb((SELECT id FROM t_bad_rule))), 'falha: regra inativa');
  PERFORM pg_temp.expect_error(jsonb_set(pg_temp.base(gen_random_uuid(), o2), '{items,0,name}', to_jsonb(repeat('x', 121))), 'falha: item inválido após gravar o pedido');
  PERFORM pg_temp.expect_error(jsonb_set(pg_temp.base(gen_random_uuid(), o2), '{suggestions,0,accepted}', '"talvez"'), 'falha: complemento inválido após gravar itens');
  PERFORM pg_temp.expect_error(jsonb_set(pg_temp.base(gen_random_uuid(), o2), '{name}', '"x"'), 'falha: dado do cliente inválido');
END $$;

ROLLBACK;
\echo 'all integration checks passed (rolled back)'
