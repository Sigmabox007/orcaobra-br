#!/usr/bin/env bash
# Concurrency check for public.submit_quote_request (everything rolled back).
# Session A writes an order and holds the per-origin lock; session B from the SAME origin
# must wait (it cannot read a stale count), while an order from ANOTHER origin goes through.
set -u
DB="${SUPABASE_DB_URL:?}"
ORIGIN="itest-origin-$(date +%s%N)"
CLONE="DO \$\$ BEGIN EXECUTE replace(pg_get_functiondef('public.submit_quote_request(jsonb)'::regprocedure),'public.submit_quote_request','pg_temp.sq'); END \$\$;"
payload() { echo "jsonb_build_object('name','Teste','whatsapp','5511999990000','original_text','pedido de teste','items','[]'::jsonb,'suggestions','[]'::jsonb,'clarifications','[]'::jsonb,'ai_failed',true,'submission_key',gen_random_uuid(),'origin','$1')"; }

psql "$DB" -Atq -c "BEGIN" -c "$CLONE" -c "SELECT pg_temp.sq($(payload "$ORIGIN"))->>'status'" -c "SELECT pg_sleep(4)" -c "ROLLBACK" >/tmp/oo_sess_a.txt 2>&1 &
sleep 1.5
SAME=$(psql "$DB" -Atq -c "BEGIN" -c "$CLONE" -c "SET LOCAL lock_timeout = '1500ms'" -c "SELECT pg_temp.sq($(payload "$ORIGIN"))->>'status'" -c "ROLLBACK" 2>&1)
OTHER=$(psql "$DB" -Atq -c "BEGIN" -c "$CLONE" -c "SET LOCAL lock_timeout = '1500ms'" -c "SELECT pg_temp.sq($(payload "$ORIGIN-other"))->>'status'" -c "ROLLBACK" 2>&1)
wait
fail=0
grep -q created /tmp/oo_sess_a.txt && echo "ok  sessão A gravou" || { echo "FAIL sessão A: $(cat /tmp/oo_sess_a.txt)"; fail=1; }
echo "$SAME" | grep -q "lock timeout" && echo "ok  mesma origem aguardou a trava (não leu contagem antiga)" || { echo "FAIL mesma origem: $SAME"; fail=1; }
echo "$OTHER" | grep -q created && echo "ok  outra origem gravou em paralelo" || { echo "FAIL outra origem: $OTHER"; fail=1; }
exit $fail
