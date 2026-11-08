# Pré-Fase 3 — Revogação segura dos vínculos de usuários à loja

Somente planejamento. Nada aplicado, nenhum dado alterado, nada publicado. Implementação só com aprovação explícita de André, etapa por etapa.

## 1. Diagnóstico (lido agora, 08/11)

- `store_members`: 2 linhas (André e Ariane, admin, loja piloto). Colunas id, user_id (sem chave estrangeira), store_id (RESTRICT), role, created_at; único (user_id, store_id). Anônimo sem permissão; logado só leitura; uma política: cada um lê o próprio vínculo, admin lê todos. **Nada usa a tabela ainda.**
- `user_roles`: fonte oficial; referência a `auth.users` com exclusão em cascata; sem escrita pelo app.
- `has_role` / `is_staff`: SECURITY DEFINER, leem só `user_roles`, **sem noção de loja**. Ambas aceitam qualquer user_id (risco P2 já registrado).
- 19 políticas: 18 usam `is_staff`/`has_role` sem filtro de loja; a de `store_members` também. Logo, hoje **qualquer funcionário vê tudo**; com uma só loja, isso é aceitável.
- Painel: a tela confere sessão e lê `user_roles` no navegador (apenas para exibir menus). A proteção real é o RLS. Exclusão de pedido passa por `deleteQuoteRequest` (servidor, sessão do próprio usuário).
- Regra da plataforma: novas tabelas não podem referenciar `auth.users`; gatilhos em `auth.users` só são permitidos para cadastro/confirmação, **não para exclusão**.

Ponto central: o token (JWT) só informa **quem** é a pessoa (`auth.uid()`). Se toda política consultar o banco em cada requisição, revogar no banco corta o acesso na hora, mesmo com sessão ou token antigos.

## 2. Alternativas comparadas

| Tema | Alternativa | Avaliação |
|---|---|---|
| Revogação | A. Apagar a linha do vínculo | Imediato, mas perde histórico de quem revogou |
| | **B. Marcar `revoked_at` / `revoked_by` (recomendado)** | Imediato e auditável; vínculo revogado nunca vale |
| | C. Papéis/loja dentro do JWT | Rejeitado: token antigo continuaria valendo até expirar |
| Conta excluída | A. Gatilho em `auth.users` ao excluir | Rejeitado: contraria a regra da plataforma |
| | **B. Função de acesso confere que a conta existe e não está bloqueada (recomendado)** | Funciona mesmo com exclusão por ferramenta administrativa (cenário 8) |
| | C. Só limpeza periódica | Insuficiente sozinha: há janela entre exclusão e limpeza |
| Órfãos | **Limpeza periódica que apenas marca `revoked_at` com motivo "conta inexistente"** + relatório | Segurança não depende dela; serve para higiene e auditoria |
| Divergência | **`store_members` passa a ser a fonte do acesso por loja; `user_roles` deixa de dar acesso a dados de loja** (detalhes na etapa 5) | Evita duas fontes de verdade |
| Gestão de vínculos | **Somente por funções do banco chamadas pelo servidor com a sessão do próprio admin** | Nunca usa a chave de serviço no navegador; a regra de "mesma loja" fica no banco |

## 3. Estrutura e SQL proposto (para revisão, não aplicar)

```sql
-- Etapa 2: revogação auditável (aditiva)
ALTER TABLE public.store_members
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revoked_by uuid,
  ADD COLUMN revoke_reason text CHECK (revoke_reason IN ('manual','conta_inexistente'));
CREATE INDEX store_members_active_idx ON public.store_members (user_id, store_id) WHERE revoked_at IS NULL;

-- Etapa 3: única função que decide acesso por loja (estado atual do banco)
CREATE FUNCTION public.can_access_store(_store uuid, _min_role public.app_role DEFAULT 'seller')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.user_id = auth.uid()          -- sempre o próprio usuário, sem parâmetro de terceiros
      AND m.store_id = _store
      AND m.revoked_at IS NULL
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until < now())
      AND (_min_role = 'seller' OR m.role = 'admin')
  )
$$;
REVOKE ALL ON FUNCTION public.can_access_store(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_store(uuid, public.app_role) TO authenticated;

-- Etapa 4: gestão de vínculos (admin só da própria loja)
CREATE FUNCTION public.revoke_store_member(_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; v_user uuid;
BEGIN
  SELECT store_id, user_id INTO v_store, v_user FROM store_members WHERE id = _member AND revoked_at IS NULL FOR UPDATE;
  IF v_store IS NULL OR NOT public.can_access_store(v_store, 'admin') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM store_members WHERE store_id = v_store AND role = 'admin' AND revoked_at IS NULL) = 1
     AND EXISTS (SELECT 1 FROM store_members WHERE id = _member AND role = 'admin') THEN
    RAISE EXCEPTION 'last_admin' USING ERRCODE = '42501';  -- nunca deixar a loja sem admin
  END IF;
  UPDATE store_members SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'manual' WHERE id = _member;
END $$;
-- grant_store_member(_store, _user, _role): mesma checagem de admin da loja;
-- o usuário precisa existir em auth.users; reativar = nova linha ou limpar revoked_at, sempre registrado.
```

Políticas da Fase 3 (exemplo, aplicado só depois): `USING (public.can_access_store(store_id))` em pedidos e regras; tabelas filhas via `EXISTS` no pedido; `store_members` visível só para admin da mesma loja. Escrita direta em `store_members` continua proibida a logados.

## 4. Cenários obrigatórios

| # | Cenário | Resultado esperado |
|---|---|---|
| 1 | Removido de uma loja | `revoked_at` preenchido → próxima requisição recusada |
| 2 | Duas lojas, removido de uma | Só o vínculo daquela loja é revogado; a outra continua |
| 3 | Conta excluída | Junção com `auth.users` falha → sem acesso; limpeza marca órfão depois |
| 4 | Sessão aberta | Cada consulta reavalia o banco → recusada imediatamente |
| 5 | Token ainda válido | Token só identifica; permissão vem do banco → recusada |
| 6 | Pedido de outra loja | Política filtra por `store_id` → 0 linhas |
| 7 | Admin mexendo em outra loja | Funções exigem admin **daquela** loja → `not_allowed` |
| 8 | Exclusão por ferramenta externa | Mesmo efeito do 3; não depende do fluxo do app |

Bloquear a conta (banimento) também corta acesso e impede renovar o token.

## 5. Sequência em etapas pequenas (cada uma com aprovação própria)

1. Backup novo confirmado por André.
2. Colunas de revogação (aditivas). Nada muda no acesso.
3. Função `can_access_store` + testes. Nada a usa ainda.
4. Funções de gestão de vínculos + função do servidor no painel (sem tela nova até aprovação).
5. Trocar as políticas por loja, **tabela por tabela**, mantendo André e Ariane como admin da piloto; `user_roles` passa a valer só para manter a tela de menus até ser substituída pela leitura de `store_members`.
6. Limpeza periódica de órfãos (rota agendada protegida pelo segredo já existente), só marca e registra.
7. Relatório; segunda loja continua proibida até validação completa.

## 6. Testes de segurança (não executados nesta etapa)

Arquivo novo em `scripts/db-tests/`, em transação revertida, simulando usuários com `SET LOCAL ROLE authenticated` e `request.jwt.claims`:
- vínculo válido lê pedidos da sua loja;
- após `revoke_store_member`, a mesma "sessão" recebe 0 linhas na consulta seguinte;
- conta inexistente ou bloqueada com token válido: 0 linhas;
- usuário da loja A não lê nem altera nada da loja B;
- admin da A recebe `not_allowed` ao revogar/conceder na B; último admin não pode ser removido;
- anônimo: sem permissão em tabelas e funções.

**Limitações:** exigem contas e uma loja fictícias. Isso só será feito com nova autorização. Também precisa da forma de execução: antes você recusou rodar pela sessão privilegiada de migração. Alternativas: um ambiente de rascunho isolado (recomendado) ou nova autorização explícita. Testes em telas com André usam a sessão dele; os de Ariane dependem da aprovação dela.

## 7. Riscos e recuperação

- Ler `auth.users` dentro da função depende do esquema da plataforma (`deleted_at`, `banned_until`). Mitigação: teste dedicado; se mudar, a função falha fechada (recusa).
- Troca de políticas pode bloquear André/Ariane. Mitigação: uma tabela por vez, conferência imediata, e volta às políticas atuais guardadas no relatório.
- Desempenho: índice parcial de vínculos ativos.
- Tokens: até 1 h de validade, mas sem efeito porque tudo é decidido no banco.
- Recuperação: etapas 2–4 são aditivas e nada as usa até a etapa 5; desligar = revogar a execução das funções.

## 8. Critérios de aceitação

- Os 8 cenários com resultado esperado em testes automatizados no banco.
- André e Ariane com acesso igual ao atual na loja piloto, verificado antes e depois.
- Contagens, regras, configurações, envio transacional e proteções das Fases 0A/0B inalterados.
- Nenhuma nova referência a `auth.users`; nenhuma chave de serviço no navegador; anônimo sem permissão.
- 69+ testes e compilação OK; nada publicado; nenhuma segunda loja real ativa.
