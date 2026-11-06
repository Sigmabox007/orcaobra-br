CREATE OR REPLACE FUNCTION public.guard_staff_request_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  allowed constant text[] := ARRAY['status','internal_notes','needs_followup_at','last_followup_at','updated_at','is_test'];
BEGIN
  -- Privileged exception only for an operation actually running as service_role.
  IF current_user = 'service_role' OR COALESCE(auth.jwt()->>'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  -- is_test is listed as allowed here because guard_test_classification already enforces it.
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Vendedores só podem alterar status, observações internas e retornos' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER guard_staff_request_update
  BEFORE UPDATE ON public.quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_staff_request_update();

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_staff_request_update() FROM PUBLIC, anon, authenticated;