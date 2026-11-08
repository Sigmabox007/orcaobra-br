# Pré-Fase 3 (revisão 1) — Revogação segura dos vínculos de usuários à loja

Somente planejamento. Nada aplicado, nenhum dado alterado, nada publicado. A Fase 3 não começa sem nova auditoria e aprovação explícita de André.

Arquitetura geral mantida. Alterações desta revisão: itens 1 a 7 do pedido, marcados como [R1]…[R7].

## 1. Diagnóstico (leitura feita em 08/11)

- `store_members`: 2 linhas (André e Ariane, admin, piloto); `user_id` sem chave estrangeira; único (user_id, store_id); anônimo sem permissão; logado só leitura. Nada usa a tabela.
- `user_roles`: fonte oficial; `has_role`/`is_staff` sem noção de loja.
- 19 políticas: 18 usam `is_staff`/`has_role`; a de `store_members` também usa `has_role`.
- Painel: a tela lê `user_roles` só para montar menus; a proteção real é o RLS.
- [R5] Verificado por leitura: `auth.users` tem `id`, `deleted_at` e `banned_until`; as funções atuais pertencem ao dono `postgres`, que tem leitura em `auth.users`; `anon` e `authenticated` **não** têm nenhuma permissão direta em `auth.users`. Portanto uma função SECURITY DEFINER de dono `postgres` consegue consultar essas colunas sem conceder nada novo a ninguém. **Ainda não confirmado:** que a função criada pela migração terá o mesmo dono — isso vira verificação obrigatória da etapa 3.
- [R6] O prazo de validade dos tokens **não foi confirmado** na configuração. O plano não depende dele: o token só identifica a pessoa; a permissão é decidida no banco a cada consulta.

## 2. Decisões (inalteradas, salvo marcações)

- Revogação por marcação auditável, nunca por apagar linha.
- Uma única função decide o acesso por loja, sempre sobre o próprio usuário (`auth.uid()`), conferindo vínculo ativo, conta existente, não excluída e não bloqueada.
- Sem gatilho em `auth.users`; sem referência a `auth.users`; sem chave de serviço no navegador.
- Gestão de vínculos só por funções do banco, chamadas pelo servidor com a sessão do próprio admin.
- [R3] **Histórico separado do estado:** `store_members` guarda o estado atual (uma linha por pessoa/loja, mantendo o `UNIQUE`); uma tabela nova somente de inclusão, `store_member_events`, guarda cada concessão, revogação e reativação. Reativar atualiza a linha atual e **acrescenta** um evento; nada de auditoria é apagado ou sobrescrito. Alternativa descartada: trocar o `UNIQUE` por índice parcial e criar novas linhas — funciona, mas espalha o histórico e complica a conferência com `user_roles`.
- [R7] **Limpeza de órfãos sem credencial nova:** função de banco executável só por `service_role`, chamada por uma rotina agendada interna que usa o mecanismo de agendamento da plataforma com seu próprio segredo dedicado (`LOVABLE_CRON_SECRET`, já existente e independente). **O segredo de HMAC das origens (`ORIGIN_HASH_SECRET`) nunca é usado para isso.** Se esse agendamento não for adequado, alternativa: execução manual pelo proprietário. A limpeza é só higiene; a segurança não depende dela.

## 3. SQL proposto (para revisão, não aplicar)

[R1] Todas as funções: `SECURITY DEFINER`, `SET search_path = ''`, objetos qualificados por esquema, `REVOKE ALL ... FROM PUBLIC, anon, authenticated` seguido de `GRANT EXECUTE` só a quem precisa.

```sql
-- Etapa 2: estado e histórico (aditivo)
ALTER TABLE public.store_members
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revoked_by uuid,
  ADD COLUMN revoke_reason text CHECK (revoke_reason IN ('manual','conta_inexistente'));
CREATE INDEX store_members_active_idx ON public.store_members (store_id, user_id) WHERE revoked_at IS NULL;

CREATE TABLE public.store_member_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  uuid NOT NULL REFERENCES public.store_members(id) ON DELETE RESTRICT,
  store_id   uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  user_id    uuid NOT NULL,
  action     text NOT NULL CHECK (action IN ('concedido','revogado','reativado','papel_alterado','orfao_marcado')),
  role       public.app_role NOT NULL,
  actor_id   uuid,               -- NULL = rotina de sistema
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public.store_member_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.store_member_events TO authenticated;
GRANT ALL ON public.store_member_events TO service_role;
ALTER TABLE public.store_member_events ENABLE ROW LEVEL SECURITY;
-- política de leitura (admin da mesma loja) criada só na etapa 5, junto com as demais
-- os 2 vínculos atuais recebem um evento 'concedido' de origem (actor_id NULL, reason 'Fase 2')

-- Etapa 3: decisão de acesso
CREATE FUNCTION public.can_access_store(_store uuid, _min_role public.app_role DEFAULT 'seller')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.user_id = auth.uid() AND m.store_id = _store AND m.revoked_at IS NULL
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND (_min_role = 'seller'::public.app_role OR m.role = 'admin'::public.app_role))
$$;
REVOKE ALL ON FUNCTION public.can_access_store(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_store(uuid, public.app_role) TO authenticated;

-- Etapa 4: gestão (corpo resumido; mesmas regras de search_path e grants)
CREATE FUNCTION public.revoke_store_member(_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.store_members%ROWTYPE; v_admins int;
BEGIN
  SELECT * INTO v FROM public.store_members WHERE id = _member;
  IF NOT FOUND OR NOT public.can_access_store(v.store_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  -- [R2] trava única por loja: toda mudança de vínculo da mesma loja passa por aqui em fila
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('oo_members:' || v.store_id::text, 0));
  SELECT * INTO v FROM public.store_members WHERE id = _member AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v.role = 'admin'::public.app_role THEN
    -- conta só admins VÁLIDOS (conta existente, não bloqueada), relida depois da trava
    SELECT count(*) INTO v_admins FROM public.store_members m JOIN auth.users u ON u.id = m.user_id
     WHERE m.store_id = v.store_id AND m.role = 'admin'::public.app_role AND m.revoked_at IS NULL
       AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now());
    IF v_admins <= 1 THEN RAISE EXCEPTION 'last_admin' USING ERRCODE = '42501'; END IF;
  END IF;
  UPDATE public.store_members SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'manual' WHERE id = _member;
  INSERT INTO public.store_member_events (member_id, store_id, user_id, action, role, actor_id)
  VALUES (v.id, v.store_id, v.user_id, 'revogado', v.role, auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.revoke_store_member(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_store_member(uuid) TO authenticated;

-- grant_store_member(_store, _user, _role): mesma trava por loja; exige admin da loja e conta válida;
--   sem linha → INSERT + evento 'concedido'; linha revogada → limpa revoked_* + evento 'reativado'
--   (o histórico fica nos eventos); mudança de papel admin→seller também passa pela regra do último admin.
-- mark_orphan_members(): EXECUTE só para service_role; marca revoke_reason='conta_inexistente' + evento.
```

[R2] Por que resolve a concorrência: as duas revogações simultâneas da mesma loja disputam a mesma trava; a segunda só continua depois que a primeira termina, e reconta os admins já vendo a revogação anterior — então recusa com `last_admin`. Concessões e mudanças de papel usam a mesma trava.

## 4. [R4] Transição das políticas — aviso expresso

**Preencher `revoked_at` não revoga nada enquanto as políticas continuarem baseadas em `user_roles`.** Até a etapa 5 estar aplicada e validada:
- as funções de gestão existem só para testes; **nenhuma tela, botão ou função do servidor de revogação fica disponível a funcionários ou administradores**;
- desligar alguém de verdade continua sendo feito por migração revisada em `user_roles` (e espelhado em `store_members`), ou bloqueando a conta.

## 5. Sequência (cada etapa com aprovação própria)

1. Backup novo confirmado por André.
2. Colunas de revogação + tabela de eventos + evento de origem dos 2 vínculos. Nada muda no acesso.
3. `can_access_store` + verificação de dono da função e permissões efetivas.
4. Funções de gestão e de limpeza (sem tela, sem função de servidor exposta).
5. Trocar políticas por loja, uma tabela por vez, com André e Ariane conferidos a cada troca; só então liberar a gestão no painel.
6. Rotina agendada de limpeza (segredo próprio do agendamento).
7. Relatório. Segunda loja continua proibida até validação completa.

## 6. Testes de segurança (não executados nesta etapa)

Arquivo em `scripts/db-tests/`, em transação revertida, simulando sessões com `SET LOCAL ROLE authenticated` e `request.jwt.claims`:
- vínculo válido acessa a própria loja; após revogação, a **mesma sessão simulada** recebe recusa na consulta seguinte (token antigo);
- conta com `deleted_at` ou `banned_until` futuro: recusa, mesmo com token válido;
- loja A não lê nem altera nada da loja B; pessoa com duas lojas perde só a revogada;
- admin da A recebe `not_allowed` na B; último admin não sai; reativação acrescenta evento e não altera eventos anteriores;
- [R2] concorrência: duas sessões revogando os dois últimos admins ao mesmo tempo (script no estilo de `submit_concurrency.sh`) → exatamente uma sucede, outra recebe `last_admin`, loja fica com 1 admin válido;
- [R1] permissões efetivas com `has_function_privilege` e `has_table_privilege`: anon sem nada; authenticated só o previsto; `mark_orphan_members` só service_role; conferir `proconfig` = `search_path=""` em todas.

**Limitações:** exigem contas e loja fictícias e uma forma de execução aprovada (você recusou antes a sessão privilegiada de migração). Recomendado: ambiente de rascunho isolado. Nada é criado sem nova autorização.

## 7. Riscos e recuperação

- Dependência das colunas `deleted_at`/`banned_until` da plataforma: se mudarem, a função passa a falhar e recusa (falha fechada); teste dedicado.
- Dono da função diferente de `postgres` poderia impedir a leitura de `auth.users`: verificação obrigatória na etapa 3; se falhar, parar e reavaliar sem conceder permissões novas.
- Troca de políticas pode bloquear André/Ariane: uma tabela por vez, políticas antigas registradas para retorno imediato.
- Prazo do token não confirmado: irrelevante para a proteção, mas registrado.
- Etapas 2–4 são aditivas e nada as usa até a 5; desligar = revogar a execução das funções.

## 8. Critérios de aceitação

- 8 cenários do pedido + teste de concorrência do último admin + reativação com histórico preservado, todos automatizados.
- Todas as funções com `search_path` vazio, objetos qualificados e permissões efetivas conferidas.
- Nenhuma referência nova a `auth.users`, nenhuma permissão nova em `auth.users`, `ORIGIN_HASH_SECRET` sem novo uso.
- Gestão de revogação indisponível no painel até a etapa 5 validada.
- André e Ariane com acesso igual ao atual; contagens, regras, configurações, envio e Fases 0A/0B/1/2 inalterados.
- 69+ testes, compilação OK, nada publicado.
