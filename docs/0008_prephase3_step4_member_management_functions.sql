-- ORÇAOBRA — PRÉ-FASE 3, ETAPA 4 — SQL PARA MIGRAÇÃO RESTRITA
-- AUTORIZAÇÃO DE ANDRÉ: SOMENTE ETAPA 4 (10/11/2026).
-- A migração depende de conferência prévia; em qualquer divergência, PARAR.
-- Dependências declaradas: etapas 2 e 3 concluídas, nenhuma etapa 5 aplicada.
-- As migrações Lovable/Drizzle devem executar este arquivo numa ÚNICA transação.
-- Não inserir BEGIN/COMMIT se a plataforma gerenciar a transação.
-- Nenhuma política RLS, tela, rota ou agendamento é criado aqui.

DO $precheck$
BEGIN
  IF pg_catalog.to_regclass('public.store_members') IS NULL
     OR pg_catalog.to_regclass('public.store_member_events') IS NULL
     OR pg_catalog.to_regprocedure('public.can_access_store(uuid,public.app_role)') IS NULL
  THEN
    RAISE EXCEPTION 'Pré-requisito das etapas 2/3 ausente';
  END IF;

  IF pg_catalog.to_regprocedure('public.grant_store_member(uuid,uuid,public.app_role)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.revoke_store_member(uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.mark_orphan_members()') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Uma função da etapa 4 já existe';
  END IF;

  IF (SELECT count(*) FROM public.store_members) <> 2
     OR (SELECT count(*) FROM public.store_members WHERE revoked_at IS NULL) <> 2
     OR (SELECT count(*) FROM public.store_member_events) <> 2
     OR (SELECT count(*) FROM public.store_member_events
         WHERE action = 'concedido' AND reason = 'Fase 2' AND actor_id IS NULL) <> 2
  THEN
    RAISE EXCEPTION 'Vínculos ou eventos divergem do fim da etapa 3';
  END IF;

  IF (
    SELECT count(*)
    FROM public.store_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.store_id = 'cd677879-a4a7-4487-bf89-411797fec356'::uuid
      AND m.user_id IN (
        '702b7233-45df-46fa-9656-f1ecec68d212'::uuid,
        '22157d7d-70ee-4e47-907b-4a6515bd3d66'::uuid
      )
      AND m.role = 'admin'::public.app_role
      AND m.revoked_at IS NULL
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now())
  ) <> 2 THEN
    RAISE EXCEPTION 'Os dois administradores válidos da loja piloto não foram confirmados';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname = 'public') <> 19
     OR (SELECT count(*) FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public') <> 7
  THEN
    RAISE EXCEPTION 'Quantidade de políticas ou funções diverge da etapa 3';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
    WHERE p.oid = 'public.can_access_store(uuid,public.app_role)'::pg_catalog.regprocedure
      AND p.prosecdef
      AND r.rolname = 'postgres'
      AND ('search_path=' = ANY(p.proconfig)
           OR 'search_path=""' = ANY(p.proconfig))
  ) THEN
    RAISE EXCEPTION 'Proprietário/segurança/search_path de can_access_store divergente';
  END IF;

  IF pg_catalog.has_function_privilege(
      'anon', 'public.can_access_store(uuid,public.app_role)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege(
      'authenticated', 'public.can_access_store(uuid,public.app_role)', 'EXECUTE')
     OR NOT pg_catalog.has_table_privilege(
      'service_role', 'public.store_member_events', 'INSERT')
  THEN
    RAISE EXCEPTION 'Permissões existentes divergentes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = 'public.store_members'::pg_catalog.regclass AND relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = 'public.store_member_events'::pg_catalog.regclass AND relrowsecurity
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_member_events'
  ) THEN
    RAISE EXCEPTION 'RLS esperado para a transição não confirmado';
  END IF;

  -- A concessão cria uma linha nova; qualquer campo obrigatório não coberto
  -- pelo INSERT precisa ter DEFAULT/IDENTITY/GENERATED no esquema real.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.store_members'::pg_catalog.regclass
      AND attname = 'id' AND atthasdef AND NOT attisdropped
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.store_members'::pg_catalog.regclass
      AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull
      AND NOT a.atthasdef AND a.attidentity = '' AND a.attgenerated = ''
      AND a.attname NOT IN ('store_id', 'user_id', 'role')
  ) THEN
    RAISE EXCEPTION 'Campos obrigatórios de store_members incompatíveis com INSERT';
  END IF;

  IF (
    SELECT pg_catalog.array_agg(e.enumlabel::text ORDER BY e.enumlabel::text)
    FROM pg_catalog.pg_enum e
    WHERE e.enumtypid = 'public.app_role'::pg_catalog.regtype
  ) IS DISTINCT FROM ARRAY['admin', 'seller']::text[] THEN
    RAISE EXCEPTION 'Os valores de public.app_role mudaram';
  END IF;
END;
$precheck$;

-- NOTA DE SEGURANÇA: CREATE e REVOKE devem ocorrer na mesma transação,
-- pois PostgreSQL concede EXECUTE a PUBLIC por padrão em novas funções.

CREATE FUNCTION public.grant_store_member(
  _store uuid,
  _user uuid,
  _role public.app_role
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $grant_member$
DECLARE
  v_member public.store_members%ROWTYPE;
  v_valid_admins integer;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'unsupported_isolation' USING ERRCODE = '25000';
  END IF;

  IF _store IS NULL OR _user IS NULL OR _role IS NULL
     OR _role NOT IN ('admin'::public.app_role, 'seller'::public.app_role)
  THEN
    RAISE EXCEPTION 'invalid_parameters' USING ERRCODE = '22023';
  END IF;

  -- Checa autorização antes de esperar; revalida após a trava da loja.
  IF NOT public.can_access_store(_store, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('oo_members:' || _store::text, 0)
  );

  IF NOT public.can_access_store(_store, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _user
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now())
  ) THEN
    RAISE EXCEPTION 'invalid_target_account' USING ERRCODE = '22023';
  END IF;

  SELECT m.* INTO v_member
  FROM public.store_members m
  WHERE m.store_id = _store AND m.user_id = _user
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.store_members (store_id, user_id, role)
    VALUES (_store, _user, _role)
    RETURNING * INTO v_member;

    INSERT INTO public.store_member_events
      (member_id, store_id, user_id, action, role, actor_id)
    VALUES
      (v_member.id, _store, _user, 'concedido', _role, auth.uid());
    RETURN v_member.id;
  END IF;

  IF v_member.revoked_at IS NOT NULL THEN
    UPDATE public.store_members
    SET revoked_at = NULL,
        revoked_by = NULL,
        revoke_reason = NULL,
        role = _role
    WHERE id = v_member.id;

    INSERT INTO public.store_member_events
      (member_id, store_id, user_id, action, role, actor_id, reason)
    VALUES
      (v_member.id, _store, _user, 'reativado', _role, auth.uid(),
       pg_catalog.format('papel_anterior=%s', v_member.role::text));
    RETURN v_member.id;
  END IF;

  -- Idempotente: mesmo papel, mesmo vínculo, nenhum evento adicional.
  IF v_member.role = _role THEN
    RETURN v_member.id;
  END IF;

  -- Não permitir a perda do último administrador válido por rebaixamento.
  IF v_member.role = 'admin'::public.app_role
     AND _role = 'seller'::public.app_role
  THEN
    SELECT count(*) INTO v_valid_admins
    FROM public.store_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.store_id = _store
      AND m.role = 'admin'::public.app_role
      AND m.revoked_at IS NULL
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now());

    IF v_valid_admins <= 1 THEN
      RAISE EXCEPTION 'last_admin' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.store_members SET role = _role WHERE id = v_member.id;

  INSERT INTO public.store_member_events
    (member_id, store_id, user_id, action, role, actor_id, reason)
  VALUES
    (v_member.id, _store, _user, 'papel_alterado', _role, auth.uid(),
     pg_catalog.format('papel_anterior=%s', v_member.role::text));

  RETURN v_member.id;
END;
$grant_member$;

REVOKE ALL ON FUNCTION public.grant_store_member(uuid, uuid, public.app_role)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.revoke_store_member(_member uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $revoke_member$
DECLARE
  v_member public.store_members%ROWTYPE;
  v_store uuid;
  v_valid_admins integer;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'unsupported_isolation' USING ERRCODE = '25000';
  END IF;

  IF _member IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT m.store_id INTO v_store
  FROM public.store_members m
  WHERE m.id = _member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_access_store(v_store, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('oo_members:' || v_store::text, 0)
  );

  SELECT m.* INTO v_member
  FROM public.store_members m
  WHERE m.id = _member AND m.store_id = v_store AND m.revoked_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_access_store(v_store, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  -- Somente a remoção de um admin ATUALMENTE válido exige preservar outro.
  -- Revogar vínculo já inválido (usuário excluído/bloqueado) não reduz a
  -- quantidade de administradores válidos disponíveis.
  IF v_member.role = 'admin'::public.app_role AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = v_member.user_id
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now())
  ) THEN
    SELECT count(*) INTO v_valid_admins
    FROM public.store_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.store_id = v_store
      AND m.role = 'admin'::public.app_role
      AND m.revoked_at IS NULL
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now());

    IF v_valid_admins <= 1 THEN
      RAISE EXCEPTION 'last_admin' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.store_members
  SET revoked_at = pg_catalog.now(),
      revoked_by = auth.uid(),
      revoke_reason = 'manual'
  WHERE id = _member;

  INSERT INTO public.store_member_events
    (member_id, store_id, user_id, action, role, actor_id, reason)
  VALUES
    (v_member.id, v_store, v_member.user_id, 'revogado', v_member.role,
     auth.uid(), 'manual');
END;
$revoke_member$;

REVOKE ALL ON FUNCTION public.revoke_store_member(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.mark_orphan_members()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $mark_orphan$
DECLARE
  v_store record;
  v_member public.store_members%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'unsupported_isolation' USING ERRCODE = '25000';
  END IF;

  -- Banned_until não é critério de órfão: bloqueio temporário ≠ exclusão.
  FOR v_store IN
    SELECT DISTINCT m.store_id
    FROM public.store_members m
    WHERE m.revoked_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = m.user_id AND u.deleted_at IS NULL
      )
    ORDER BY m.store_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('oo_members:' || v_store.store_id::text, 0)
    );

    -- A lista de órfãos é recalculada após adquirir a trava.
    FOR v_member IN
      SELECT m.*
      FROM public.store_members m
      WHERE m.store_id = v_store.store_id
        AND m.revoked_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM auth.users u
          WHERE u.id = m.user_id AND u.deleted_at IS NULL
        )
      ORDER BY m.id
      FOR UPDATE OF m
    LOOP
      UPDATE public.store_members
      SET revoked_at = pg_catalog.now(),
          revoked_by = NULL,
          revoke_reason = 'conta_inexistente'
      WHERE id = v_member.id;

      INSERT INTO public.store_member_events
        (member_id, store_id, user_id, action, role, actor_id, reason)
      VALUES
        (v_member.id, v_member.store_id, v_member.user_id, 'orfao_marcado',
         v_member.role, NULL, 'conta_inexistente');

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$mark_orphan$;

REVOKE ALL ON FUNCTION public.mark_orphan_members()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_orphan_members() TO service_role;

-- Pós-condições devem falhar na MESMA transação se o estado divergir.
DO $postcheck$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public') <> 10
     OR (SELECT count(*) FROM pg_catalog.pg_policies
         WHERE schemaname = 'public') <> 19
  THEN
    RAISE EXCEPTION 'Contagem de funções ou políticas divergente';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
    WHERE p.oid IN (
      'public.grant_store_member(uuid,uuid,public.app_role)'::pg_catalog.regprocedure,
      'public.revoke_store_member(uuid)'::pg_catalog.regprocedure,
      'public.mark_orphan_members()'::pg_catalog.regprocedure
    )
      AND p.prosecdef
      AND r.rolname = 'postgres'
      AND ('search_path=' = ANY(p.proconfig)
           OR 'search_path=""' = ANY(p.proconfig))
      AND p.provolatile = 'v'
  ) <> 3 THEN
    RAISE EXCEPTION 'Dono, SECURITY DEFINER, search_path ou volatilidade divergente';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.grant_store_member(uuid,uuid,public.app_role)', 'anon', false),
      ('public.grant_store_member(uuid,uuid,public.app_role)', 'authenticated', false),
      ('public.grant_store_member(uuid,uuid,public.app_role)', 'service_role', false),
      ('public.revoke_store_member(uuid)', 'anon', false),
      ('public.revoke_store_member(uuid)', 'authenticated', false),
      ('public.revoke_store_member(uuid)', 'service_role', false),
      ('public.mark_orphan_members()', 'anon', false),
      ('public.mark_orphan_members()', 'authenticated', false),
      ('public.mark_orphan_members()', 'service_role', true)
    ) AS rights(signature, role_name, expected)
    WHERE pg_catalog.has_function_privilege(
      rights.role_name, rights.signature, 'EXECUTE'
    ) IS DISTINCT FROM rights.expected
  ) THEN
    RAISE EXCEPTION 'Permissões efetivas das novas funções divergentes';
  END IF;

  -- A etapa 4 não deve ampliar os direitos diretos sobre as tabelas.
  IF pg_catalog.has_table_privilege('anon', 'public.store_members', 'SELECT')
     OR NOT pg_catalog.has_table_privilege('authenticated', 'public.store_members', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.store_members', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.store_members', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.store_members', 'DELETE')
     OR pg_catalog.has_table_privilege('anon', 'public.store_member_events', 'SELECT')
     OR NOT pg_catalog.has_table_privilege('authenticated', 'public.store_member_events', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.store_member_events', 'INSERT')
     OR NOT pg_catalog.has_table_privilege('service_role', 'public.store_member_events', 'INSERT')
     OR pg_catalog.has_table_privilege('service_role', 'public.store_member_events', 'UPDATE')
     OR pg_catalog.has_table_privilege('service_role', 'public.store_member_events', 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'auth.users', 'SELECT')
  THEN
    RAISE EXCEPTION 'Permissões sobre tabelas foram ampliadas/alteradas';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_member_events'
  ) THEN
    RAISE EXCEPTION 'Política de leitura de eventos criada antes da etapa 5';
  END IF;

  IF (SELECT count(*) FROM public.store_members) <> 2
     OR (SELECT count(*) FROM public.store_members
         WHERE revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL) <> 2
     OR (SELECT count(*) FROM public.store_member_events) <> 2
     OR (SELECT count(*) FROM public.store_member_events
         WHERE action = 'concedido' AND reason = 'Fase 2' AND actor_id IS NULL) <> 2
  THEN
    RAISE EXCEPTION 'Dados de vínculo/histórico foram alterados na etapa 4';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname = 'public'
      AND (pol.qual LIKE '%can_access_store%' OR pol.with_check LIKE '%can_access_store%')
  ) THEN
    RAISE EXCEPTION 'Políticas foram prematuramente associadas à nova função';
  END IF;

  -- Contagem GLOBAL inclui referências internas da plataforma. Conferir
  -- somente o contrato das tabelas da aplicação envolvidas nesta etapa.
  IF (
    SELECT count(*) FROM pg_catalog.pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.user_roles'::pg_catalog.regclass
      AND c.confrelid = 'auth.users'::pg_catalog.regclass
  ) <> 1 OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid IN (
        'public.store_members'::pg_catalog.regclass,
        'public.store_member_events'::pg_catalog.regclass
      )
      AND c.confrelid = 'auth.users'::pg_catalog.regclass
  ) THEN
    RAISE EXCEPTION 'FKs da aplicação para auth.users divergentes';
  END IF;
END;
$postcheck$;

-- Pendências ANTES de permitir a migração:
-- [ ] Auditoria independente do SQL comparado ao esquema real e ao plano.
-- [ ] Confirmar ausência de migrações pendentes fora do escopo da etapa 4.
-- [ ] Confirmar rollback de transação em caso de postcheck falho.
-- [ ] Plano de teste funcional isolado (SEM usar rascunho Lovable no mesmo DB).
-- [ ] Testes de execução: anon/seller sem acesso; admin apenas da sua loja;
--     grant inicial, grant idempotente, mudança de papel, revogação com evento;
--     último admin protegido em revogação e rebaixamento; concorrência de 2 admins;
--     reativação com histórico preservado; usuário excluído/bloqueado e órfãos.
-- [ ] Mesmo JWT revogado deve perder acesso APENAS após a política RLS da etapa 5.
-- [x] Autorização restrita de André à Etapa 4, em 10/11/2026.
-- [ ] Confirmação explícita na interface de aprovação da migração, após revisar o SQL exibido.
