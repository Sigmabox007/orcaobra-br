# Fase 2 — SQL proposto (NÃO APLICADO, aguardando autorização)

Backup: `database_export_08_11_26/orcaobra-br_261108.backup` (443 KB, 08/11/2026), confirmado pelo proprietário; integridade e restauração **não testadas**.

## Pré-requisitos conferidos (leitura, 08/11)
- André: `702b7233-45df-46fa-9656-f1ecec68d212` (andretraderinvest@gmail.com), papel admin (`user_roles.id` 0463203d-9b19-4a44-892f-3273f45ed107).
- Ariane: `22157d7d-70ee-4e47-907b-4a6515bd3d66` (bazarmra@gmail.com), papel admin (`user_roles.id` 03e94d6a-7fe8-4ca9-8ead-143f21bb87ff).
- Loja piloto `cd677879-a4a7-4487-bf89-411797fec356` existe; `store_members` ainda não existe.
- Contagens antes: contas 2, lojas 1, pedidos 14, itens 20, complementos 11, histórico 12, retornos 1, regras 22, uso IA 22, envios 11, configurações 1, papéis 2.
- Catálogo antes: 18 políticas, 3 gatilhos, 6 funções no esquema público.

## SQL (uma migração, transação única)
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

REVOKE ALL ON TABLE public.store_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.store_members TO authenticated;
GRANT ALL ON public.store_members TO service_role;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memberships readable" ON public.store_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

COMMENT ON TABLE public.store_members IS 'Fase 2: preparatória, ainda não usada por políticas/funções; user_roles segue como fonte oficial.';

INSERT INTO public.store_members (user_id, store_id, role)
SELECT ur.user_id, 'cd677879-a4a7-4487-bf89-411797fec356'::uuid, ur.role
FROM public.user_roles ur
WHERE ur.user_id IN ('702b7233-45df-46fa-9656-f1ecec68d212','22157d7d-70ee-4e47-907b-4a6515bd3d66')
  AND ur.role = 'admin';
```

## Verificação de escopo
- Cria só 1 tabela, 1 índice, 1 política (na tabela nova) e permissões só na tabela nova.
- Sem ALTER/DROP em tabelas, funções, gatilhos ou políticas existentes; `has_role`, `is_staff`, `guard_staff_request_update` e `submit_quote_request` intactos.
- Única gravação: 2 linhas em `store_members`. Não grava em `user_roles`, `auth.users`, `stores` nem em outra tabela.
- Sem permissão para anônimos; usuários logados só leem.
- Não isola lojas (Fase 3).

## Critérios após aplicação
- Contagens acima iguais; `store_members` = 2 linhas; `user_roles` igual linha a linha.
- Catálogo: 19 políticas (18 + 1 nova), 3 gatilhos, 6 funções.
- Diferença `user_roles` × `store_members` vazia; 69+ testes e compilação OK; nada publicado.

### Verificação de permissões efetivas (após aplicação)
```sql
-- Esperado: anon = false em tudo; authenticated = true só em SELECT.
SELECT r.role, p.priv
FROM (VALUES ('anon'), ('authenticated')) AS r(role)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) AS p(priv)
ORDER BY r.role, p.priv;
-- conferida com:
SELECT r.role, p.priv,
       has_table_privilege(r.role, 'public.store_members', p.priv) AS permitido
FROM (VALUES ('anon'), ('authenticated')) AS r(role)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) AS p(priv)
ORDER BY r.role, p.priv;
```
Resultado esperado: `anon` sem nenhuma permissão (5× false); `authenticated` com `SELECT` = true e `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` = false.
