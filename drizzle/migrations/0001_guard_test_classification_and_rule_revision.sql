CREATE OR REPLACE FUNCTION public.guard_test_classification()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_test IS DISTINCT FROM OLD.is_test AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Somente administradores podem alterar a classificação de teste' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_test_classification BEFORE UPDATE ON public.quote_requests FOR EACH ROW EXECUTE FUNCTION public.guard_test_classification();
CREATE OR REPLACE FUNCTION public.rules_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.category, NEW.trigger, NEW.complement, NEW.condition, NEW.clarifying_question, NEW.explanation) IS DISTINCT FROM ROW(OLD.category, OLD.trigger, OLD.complement, OLD.condition, OLD.clarifying_question, OLD.explanation) THEN
      NEW.reviewed := false;
      NEW.active := false;
      NEW.reviewed_by := NULL;
      NEW.reviewed_at := NULL;
    END IF;
  END IF;
  IF NEW.active AND NOT NEW.reviewed THEN
    RAISE EXCEPTION 'Regra precisa ser revisada antes de ser ativada';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;