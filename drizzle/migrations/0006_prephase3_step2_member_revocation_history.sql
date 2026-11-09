DO $precheck$
BEGIN
  IF to_regclass('public.store_members') IS NULL THEN
    RAISE EXCEPTION 'store_members não existe';
  END IF;

  IF to_regclass('public.store_member_events') IS NOT NULL THEN
    RAISE EXCEPTION 'store_member_events já existe';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.store_members'::regclass
      AND attname IN (
        'revoked_at',
        'revoked_by',
        'revoke_reason'
      )
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'Colunas de revogação já existem';
  END IF;

  IF (SELECT count(*) FROM public.store_members) <> 2 THEN
    RAISE EXCEPTION 'Quantidade inesperada de vínculos';
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
      AND m.user_id IN (
        '702b7233-45df-46fa-9656-f1ecec68d212'::uuid,
        '22157d7d-70ee-4e47-907b-4a6515bd3d66'::uuid
      )
  ) <> 2 THEN
    RAISE EXCEPTION 'Administradores divergentes';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class
    WHERE oid = 'public.store_members'::regclass
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS de store_members não está ativo';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
  ) <> 19 THEN
    RAISE EXCEPTION 'Catálogo de políticas divergente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'service_role'
      AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'BYPASSRLS de service_role não confirmado';
  END IF;
END;
$precheck$;

ALTER TABLE public.store_members
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revoked_by uuid,
  ADD COLUMN revoke_reason text
    CHECK (
      revoke_reason IN ('manual', 'conta_inexistente')
    );

CREATE INDEX store_members_active_idx
  ON public.store_members (store_id, user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE public.store_member_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  member_id uuid NOT NULL
    REFERENCES public.store_members(id) ON DELETE RESTRICT,

  store_id uuid NOT NULL
    REFERENCES public.stores(id) ON DELETE RESTRICT,

  user_id uuid NOT NULL,

  action text NOT NULL CHECK (
    action IN (
      'concedido',
      'revogado',
      'reativado',
      'papel_alterado',
      'orfao_marcado'
    )
  ),

  role public.app_role NOT NULL,
  actor_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.store_member_events
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON public.store_member_events
  TO authenticated;

GRANT SELECT, INSERT ON public.store_member_events
  TO service_role;

ALTER TABLE public.store_member_events
  ENABLE ROW LEVEL SECURITY;

-- Não criar política RLS nesta etapa.
-- A política de leitura será criada somente na Etapa 5.

INSERT INTO public.store_member_events (
  member_id,
  store_id,
  user_id,
  action,
  role,
  actor_id,
  reason
)
SELECT
  m.id,
  m.store_id,
  m.user_id,
  'concedido',
  m.role,
  NULL::uuid,
  'Fase 2'
FROM public.store_members m;

DO $postcheck$
BEGIN
  IF (SELECT count(*) FROM public.store_member_events) <> 2 THEN
    RAISE EXCEPTION 'Quantidade incorreta de eventos';
  END IF;

  IF (
    SELECT count(DISTINCT member_id)
    FROM public.store_member_events
    WHERE action = 'concedido'
      AND reason = 'Fase 2'
      AND actor_id IS NULL
  ) <> 2 THEN
    RAISE EXCEPTION 'Eventos de origem divergentes';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.store_members
    WHERE revoked_at IS NOT NULL
       OR revoked_by IS NOT NULL
       OR revoke_reason IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Vínculo inesperadamente revogado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class
    WHERE oid = 'public.store_member_events'::regclass
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS da tabela de eventos não está ativo';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
  ) <> 19 THEN
    RAISE EXCEPTION 'Quantidade de políticas alterada';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('anon'),
        ('authenticated'),
        ('service_role')
    ) AS r(role)
    CROSS JOIN (
      VALUES
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE')
    ) AS p(priv)
    WHERE has_table_privilege(
      r.role,
      'public.store_member_events',
      p.priv
    ) IS DISTINCT FROM
      CASE
        WHEN r.role = 'authenticated'
         AND p.priv = 'SELECT' THEN true
        WHEN r.role = 'service_role'
         AND p.priv IN ('SELECT', 'INSERT') THEN true
        ELSE false
      END
  ) THEN
    RAISE EXCEPTION 'Permissões efetivas divergentes';
  END IF;
END;
$postcheck$;