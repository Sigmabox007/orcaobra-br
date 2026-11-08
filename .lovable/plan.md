# Fase 2 (revisão) — Vínculo preparatório dos administradores com a loja piloto

Somente planejamento. Nada aplicado, nenhum dado alterado, nada publicado.

## O que muda em relação ao SQL anterior

Única alteração: `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` passa a `user_id uuid NOT NULL`. Todo o resto (colunas, chave única, índice, REVOKE/GRANT, RLS, política, comentário, inserção dos 2 administradores, critérios de aceitação) fica igual.

**Consequência registrada:** sem a chave estrangeira, apagar uma conta **não apaga automaticamente** os vínculos dela em `store_members`. Podem sobrar vínculos órfãos (user_id sem conta). Nesta fase isso não dá acesso a ninguém, porque nenhuma política ou função usa `store_members` ainda e uma conta apagada não consegue entrar.

**Requisito bloqueante da Fase 3:** antes de qualquer política passar a usar `store_members`, definir e validar um mecanismo seguro de revogação e limpeza dos vínculos de contas excluídas (com testes). Sem isso, a Fase 3 não começa.

Fora do escopo desta revisão: nenhuma tabela adicional, gatilho ou função; nada em `auth.users`, `user_roles` ou outra tabela existente.

## Backup

`database_export_08_11_26/orcaobra-br_261108.backup` (443 KB, 08/11/2026), confirmado pelo proprietário; integridade e restauração **não testadas**.

## Verificações ANTES (somente leitura)

```sql
-- 1. Os dois administradores existem como contas e como admin
SELECT u.id, u.email, ur.role
FROM auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'admin'
WHERE u.id IN ('702b7233-45df-46fa-9656-f1ecec68d212','22157d7d-70ee-4e47-907b-4a6515bd3d66');
-- Esperado: 2 linhas

-- 2. Tabela ainda não existe
SELECT to_regclass('public.store_members');  -- Esperado: NULL

-- 3. Contagens e catálogo (comparar depois)
-- contas 2, lojas 1, pedidos 14, itens 20, complementos 11, histórico 12,
-- retornos 1, regras 22, uso IA 22, envios 11, configurações 1, papéis 2;
-- 18 políticas, 3 gatilhos, 6 funções no esquema público.
```

## SQL completo revisado (uma migração, transação única)

```sql
CREATE TABLE public.store_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
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
COMMENT ON COLUMN public.store_members.user_id IS 'ID da conta sem chave estrangeira (regra da plataforma); exclusão de conta não remove o vínculo automaticamente. Limpeza/revogação: requisito bloqueante da Fase 3.';

INSERT INTO public.store_members (user_id, store_id, role)
SELECT ur.user_id, 'cd677879-a4a7-4487-bf89-411797fec356'::uuid, ur.role
FROM public.user_roles ur
WHERE ur.user_id IN ('702b7233-45df-46fa-9656-f1ecec68d212','22157d7d-70ee-4e47-907b-4a6515bd3d66')
  AND ur.role = 'admin';
```

Nota: o único acréscimo além da troca pedida é o `COMMENT ON COLUMN` documentando a ausência da chave. Se preferir, ele pode ser retirado sem efeito no funcionamento.

## Verificações DEPOIS (somente leitura)

```sql
-- 1. Vínculos correspondem a contas existentes (esperado: 2 linhas)
SELECT sm.user_id, u.email, sm.store_id, sm.role
FROM public.store_members sm
JOIN auth.users u ON u.id = sm.user_id;

-- 2. Nenhum vínculo órfão (esperado: 0)
SELECT count(*) FROM public.store_members sm
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = sm.user_id);

-- 3. Diferença user_roles(admin) x store_members (esperado: vazio nos dois sentidos)
SELECT user_id, role FROM public.user_roles WHERE role = 'admin'
EXCEPT SELECT user_id, role FROM public.store_members;
SELECT user_id, role FROM public.store_members
EXCEPT SELECT user_id, role FROM public.user_roles WHERE role = 'admin';

-- 4. Permissões efetivas: anon 5x false; authenticated só SELECT = true
SELECT r.role, p.priv,
       has_table_privilege(r.role, 'public.store_members', p.priv) AS permitido
FROM (VALUES ('anon'), ('authenticated')) AS r(role)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) AS p(priv)
ORDER BY r.role, p.priv;

-- 5. Confirmar que não há chave estrangeira para auth.users (esperado: 0)
SELECT count(*) FROM pg_constraint
WHERE conrelid = 'public.store_members'::regclass AND contype = 'f'
  AND confrelid = 'auth.users'::regclass;
```

## Critérios de aceitação (inalterados)

- Contagens iguais às de antes; `store_members` = 2 linhas; `user_roles` igual linha a linha.
- Catálogo: 19 políticas (18 + 1), 3 gatilhos, 6 funções.
- Verificações 1–5 com os resultados esperados.
- 69+ testes e compilação OK; nada publicado; Fase 3 não iniciada.

## Registros após aprovação

- Atualizar `docs/fase-2-sql-proposto.md` com este SQL e as verificações.
- `relatorio-fase-2.md` e `roadmap.md`: ausência de exclusão automática e requisito bloqueante da Fase 3.
- Migração só após sua autorização explícita.
