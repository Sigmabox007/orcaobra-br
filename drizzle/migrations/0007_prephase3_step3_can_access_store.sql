-- PRÉ-VERIFICAÇÕES

DO $precheck$
DECLARE
  v_roles text[];
BEGIN
  IF to_regclass('public.store_members') IS NULL
     OR to_regclass('public.store_member_events') IS NULL
  THEN
    RAISE EXCEPTION 'Tabelas da Etapa 2 ausentes';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'can_access_store'
  ) THEN
    RAISE EXCEPTION 'can_access_store já existe';
  END IF;

  IF (SELECT count(*) FROM public.store_members) <> 2
     OR (
        SELECT count(*)
       FROM public.store_members
       WHERE revoked_at IS NULL
     ) <> 2
  THEN
    RAISE EXCEPTION 'Vínculos divergentes';
  END IF;

  IF (
    SELECT count(DISTINCT m.user_id)
     FROM public.store_members m
    JOIN public.user_roles ur
      ON ur.user_id = m.user_id
     AND ur.role = m.role
    JOIN auth.users u
      ON u.id = m.user_id
    WHERE m.store_id =
      'cd677879-a4a7-4487-bf89-411797fec356'::uuid
      AND m.role = 'admin'::public.app_role
      AND m.revoked_at IS NULL
      AND m.user_id IN (
        '702b7233-45df-46fa-9656-f1ecec68d212'::uuid,
        '22157d7d-70ee-4e47-907b-4a6515bd3d66'::uuid
      )
  ) <> 2 THEN
    RAISE EXCEPTION 'Administradores divergentes';
  END IF;

  IF (SELECT count(*) FROM public.store_member_events) <> 2 THEN
    RAISE EXCEPTION 'Eventos históricos divergentes';
  END IF;

  SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel::text)
  INTO v_roles
  FROM pg_catalog.pg_enum e
  JOIN pg_catalog.pg_type t
    ON t.oid = e.enumtypid
  JOIN pg_catalog.pg_namespace n
    ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'app_role';

  IF v_roles IS DISTINCT FROM
     ARRAY['admin', 'seller']::text[]
  THEN
    RAISE EXCEPTION 'Valores inesperados em app_role';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'auth.users'::regclass
      AND attname IN ('id', 'deleted_at', 'banned_until')
      AND NOT attisdropped
  ) <> 3 THEN
    RAISE EXCEPTION 'Colunas de auth.users divergentes';
  END IF;

  IF NOT has_table_privilege(
    'postgres', 'auth.users', 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Leitura de auth.users não confirmada';
  END IF;

  IF has_table_privilege('anon', 'auth.users', 'SELECT')
     OR has_table_privilege(
       'authenticated', 'auth.users', 'SELECT'
     )
  THEN
    RAISE EXCEPTION 'Permissões de auth.users divergentes';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
  ) <> 19 THEN
    RAISE EXCEPTION 'Quantidade de políticas divergente';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ) <> 6 THEN
    RAISE EXCEPTION 'Quantidade de funções divergente';
  END IF;
END;
$precheck$;

-- FUNÇÃO DE ACESSO POR LOJA

CREATE FUNCTION public.can_access_store(
  _store uuid,
  _min_role public.app_role
    DEFAULT 'seller'::public.app_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_members m
    JOIN auth.users u
      ON u.id = m.user_id
    WHERE
      m.user_id = auth.uid()
      AND m.store_id = _store
      AND m.revoked_at IS NULL
      AND u.deleted_at IS NULL
      AND (
        u.banned_until IS NULL
        OR u.banned_until <= pg_catalog.now()
      )
      AND CASE _min_role
        WHEN 'seller'::public.app_role THEN
          m.role IN (
            'seller'::public.app_role,
            'admin'::public.app_role
          )
        WHEN 'admin'::public.app_role THEN
          m.role = 'admin'::public.app_role
        ELSE false
      END
  )
$$;

-- PERMISSÕES

REVOKE ALL
ON FUNCTION public.can_access_store(uuid, public.app_role)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.can_access_store(uuid, public.app_role)
TO authenticated;

-- VERIFICAÇÕES ANTES DE CONFIRMAR A TRANSAÇÃO

DO $postcheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    WHERE p.oid =
       to_regprocedure(
        'public.can_access_store(uuid,public.app_role)'
      )
      AND p.prosecdef
      AND p.provolatile = 's'
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'Proprietário ou configuração da função divergente';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.can_access_store(uuid,public.app_role)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Anon possui EXECUTE indevido';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.can_access_store(uuid,public.app_role)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Authenticated sem EXECUTE';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
  ) <> 19 THEN
    RAISE EXCEPTION 'Políticas foram alteradas';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ) <> 7 THEN
    RAISE EXCEPTION 'Catálogo de funções divergente';
  END IF;

  IF (SELECT count(*) FROM public.store_members) <> 2
     OR (SELECT count(*) FROM public.store_member_events) <> 2
  THEN
    RAISE EXCEPTION 'Dados de vínculos foram alterados';
  END IF;
END;
$postcheck$;