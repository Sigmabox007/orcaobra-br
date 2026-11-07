# Fase 2 — Vínculo de usuários à loja (plano técnico para auditoria)

Somente planejamento. Nada é aplicado, criado ou publicado sem sua aprovação explícita.

**A Fase 2 NÃO isola uma loja da outra.** Nenhuma segunda loja real pode funcionar antes de as fases seguintes estarem concluídas e testadas.

## 1. Auditoria (leitura feita agora, 07/11)

- Loja: 1 — A.S. Figueiredo Materiais de Construção, `cd677879-a4a7-4487-bf89-411797fec356`.
- `user_roles`: 2 linhas, ambas `admin`:
  - André `702b7233-45df-46fa-9656-f1ecec68d212`
  - Ariane `22157d7d-70ee-4e47-907b-4a6515bd3d66`
  - Restrições: chave primária `id`, `UNIQUE(user_id, role)`, FK para `auth.users` com ON DELETE CASCADE. Política única: cada um lê o próprio papel, admin lê todos. Sem escrita pelo app.
- `auth.users`: o ambiente de leitura não tem acesso a esse esquema. Os IDs acima vêm de `user_roles` e do relatório da Fase 1. **Antes de aplicar**, eu confirmo os e-mails e IDs por uma consulta com permissão; se algo não bater, paro.
- Funções: `has_role(uid, role)` e `is_staff(uid)` (SECURITY DEFINER, search_path fixo, leem só `user_roles`; sem execução para anônimos desde a 0B).
- Políticas que dependem delas (19): `ai_usage`, `app_settings`, `association_rules` (4), `followups` (2), `quote_requests` (3), `request_items`, `status_history` (2), `stores`, `suggested_complements` e `user_roles`. **Nenhuma muda nesta fase.**
- Contagens atuais: pedidos 14, regras 22, uso IA 22, papéis 2, lojas 1. Elas são recontadas logo antes da migração.

## 2. Estrutura proposta

```sql
CREATE TABLE public.store_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id   uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  role       public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_members_user_store_key UNIQUE (user_id, store_id)
);
CREATE INDEX store_members_store_id_idx ON public.store_members (store_id);
```

Justificativas:
- O papel usa o tipo `app_role` que já existe (admin/seller). Assim nenhum outro valor é aceito, sem precisar de uma regra extra.
- Unicidade por (usuário, loja): um papel por pessoa em cada loja. O índice único já atende às buscas por usuário. O índice em `store_id` serve para as consultas por loja da Fase 3 e para a verificação da chave estrangeira.
- A FK para `auth.users` com CASCADE segue a exceção já permitida para tabelas de papéis. Com `RESTRICT` na loja, apagar uma loja nunca apaga vínculos sem aviso.
- Ficam de fora por enquanto: convite, status e criado_por. Esses campos entram quando houver gestão de equipe.

## 3. Segurança desde a criação

```sql
GRANT SELECT ON public.store_members TO authenticated;
GRANT ALL ON public.store_members TO service_role;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memberships readable" ON public.store_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
```

- Anônimos não têm nenhuma permissão. Usuários logados não podem inserir, alterar nem apagar, porque não têm permissão nem política para isso. Ninguém consegue se dar o papel de admin ou se vincular a outra loja. Só a migração e o servidor (service_role) escrevem.
- A leitura segue o mesmo padrão de `user_roles`: cada pessoa vê o próprio vínculo, e o admin vê todos.
- Nenhuma função nova SECURITY DEFINER nesta fase.

## 4. Preenchimento (aditivo)

```sql
INSERT INTO public.store_members (user_id, store_id, role)
SELECT ur.user_id, 'cd677879-a4a7-4487-bf89-411797fec356'::uuid, ur.role
FROM public.user_roles ur
WHERE ur.user_id IN ('702b7233-45df-46fa-9656-f1ecec68d212','22157d7d-70ee-4e47-907b-4a6515bd3d66')
  AND ur.role = 'admin';
```

Nenhum usuário criado, nenhuma senha trocada, nenhum convite enviado. Nenhum registro de `user_roles` é tocado.

## 5. Evitar divergência na transição

- **Fonte oficial nesta fase:** `user_roles`. `store_members` é só preparação e não é lida por nenhuma função, política ou tela.
- Nenhum vendedor é cadastrado até a Fase 3. Por isso as duas tabelas só mudam por migração revisada, que sempre altera as duas juntas.
- Sem sincronização automática por gatilho: ela criaria um caminho de escrita a mais para auditar. Fica documentado que qualquer novo papel até a Fase 3 deve ser incluído nas duas tabelas na mesma migração.
- Consulta de conferência após a migração e no início da Fase 3: a diferença entre `user_roles` e `store_members` (por usuário e papel) deve ser vazia.
- Regra registrada no `AGENTS.md`.

## 6. Sequência

1. Exportação nova: o backup de 07/11 (`orcaobra-br_261107.backup`) é de antes da Fase 1, que mudou o esquema. Peço uma **exportação atualizada pós-Fase 1**, confirmada por você, antes de aplicar. Fica registrado que a restauração não foi testada.
2. Confirmar os IDs em `auth.users` e recontar 11 tabelas (lojas, pedidos, itens, complementos, histórico, retornos, regras, uso IA, envios, configurações, papéis) e o total de contas.
3. Uma migração única e transacional, com as seções 2, 3 e 4 juntas: se qualquer passo falhar, nada fica gravado. Sem testes dentro da migração.
4. Recontar e comparar.
5. Testes automáticos e compilação.
6. Verificação no painel como admin.
7. Relatório em `relatorio-fase-2.md`, sem publicação.

Produção e prévia usam o mesmo banco: a tabela passa a existir na hora, mas nada a lê. O site publicado não muda.

## 7. Verificação de André e Ariane

- **Banco (leitura):** `has_role` e `is_staff` dos dois continuam verdadeiros, e `user_roles` fica idêntico, linha por linha (mesmos id, user_id e role, conferidos antes e depois).
- **Tela, como André** (sessão gerada sem senha): entrar no painel, ver a lista e o detalhe de um pedido **de teste**, mudar o status e a nota interna e depois desfazer, abrir Complementos e Configurações sem salvar nada.
- **Ariane:** a sessão dela exige sua aprovação no momento. Sem isso, a verificação vale só no banco, e isso fica dito no relatório.

## 8. Riscos

- FK com CASCADE em `auth.users`: apagar uma conta remove o vínculo. Isso é esperado e igual ao que já acontece em `user_roles`.
- Divergência entre as tabelas se alguém mudar papéis fora de uma migração revisada. Mitigação: consulta de conferência e regra no AGENTS.md.
- A leitura de vínculos alheios pelo admin é aceitável enquanto só existe uma loja. Na Fase 3, ela passa a ser restrita à loja do admin.
- O backup não tem restauração testada.

## 9. Recuperação sem perda

A tabela é nova e independente: nada lê `store_members`. Para desligar, basta `REVOKE ALL ON public.store_members FROM authenticated` (instantâneo). A remoção só aconteceria com sua aprovação explícita, porque descarta apenas os 2 vínculos novos, que podem ser recriados pelo próprio SQL. Nenhum dado existente é afetado.

## 10. Critérios de aceitação

- As contagens das 11 tabelas e o total de contas são iguais antes e depois.
- `store_members` tem exatamente 2 linhas: André e Ariane, loja piloto, `admin`.
- `user_roles` não muda, linha por linha.
- Nenhuma conta nova é criada.
- Funções, gatilhos e políticas das outras tabelas não mudam (comparação do catálogo antes e depois).
- `store_members` não dá nenhuma permissão a anônimos e não permite escrita por usuários logados (conferido nas permissões do catálogo).
- Diferença entre `user_roles` e `store_members` vazia.
- 69 ou mais testes automáticos aprovados e compilação OK.
- Painel verificado como André. Ariane conforme a seção 7.
- Nada publicado.

## Fora do escopo

Isolamento entre lojas, mudança de políticas, segunda loja, vendedores (reais ou fictícios), telas e gestão de equipe.
