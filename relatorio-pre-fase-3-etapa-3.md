# Relatório — Pré-Fase 3, Etapa 3: função `public.can_access_store`

Data: 10/11/2026. Execução restrita à autorização de André. Nada publicado. Etapas 4 a 7 não iniciadas.

## 1. Pré-requisitos (somente leitura, todos confirmados)

| Verificação | Esperado | Obtido |
|---|---|---|
| `store_members` com 2 vínculos, nenhum revogado | 2 / 2 | 2 / 2 |
| André e Ariane administradores da loja piloto | 2 | 2 |
| `store_member_events` com 2 eventos da Fase 2 | 2 | 2 |
| `can_access_store` ainda inexistente | 0 | 0 |
| `app_role` contém exatamente `admin` e `seller` | {admin,seller} | {admin,seller} |
| Políticas RLS em `public` | 19 | 19 |
| Funções em `public` | 6 | 6 |
| `auth.users` possui `id`, `deleted_at`, `banned_until` | 3 colunas | 3 colunas |
| `postgres` com leitura sobre `auth.users` | true | true |
| `anon` e `authenticated` sem leitura sobre `auth.users` | false / false | false / false |

Observação de ambiente: a sessão `psql` do sandbox não tem permissão sobre o esquema `auth` (restrição esperada da sessão). As consultas que tocam `auth.users` foram feitas pela ferramenta de leitura do banco gerenciado. Nenhuma divergência encontrada; nenhuma correção automática foi necessária.

## 2. SQL aplicado

Aplicado exatamente o SQL autorizado, em transação única do mecanismo de migrações (sem `BEGIN`/`COMMIT` explícitos, conforme previsto na autorização). Migração: `drizzle/migrations/0007_prephase3_step3_can_access_store.sql`.

Conteúdo: pré-verificações em bloco `DO`, criação de `public.can_access_store(uuid, app_role)` (`LANGUAGE sql`, `STABLE`, `SECURITY DEFINER`, `search_path = ''`), `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE ... TO authenticated` e pós-verificações em bloco `DO` antes da confirmação da transação.

## 3. Proprietário e configurações da função

- Proprietário: `postgres`.
- `SECURITY DEFINER`: sim. `STABLE`: sim. `search_path`: vazio (`""`).
- Todos os objetos qualificados por esquema (`public.store_members`, `auth.users`, `pg_catalog.now()`, casts em `public.app_role`).
- Comportamento: retorna verdadeiro somente se o usuário da sessão (`auth.uid()`) tiver vínculo ativo (`revoked_at IS NULL`) com a loja informada, a conta não estiver excluída (`deleted_at IS NULL`) nem banida (`banned_until` nulo ou no passado), e o papel atender ao mínimo pedido (`seller` aceita seller e admin; `admin` aceita só admin; qualquer outro valor retorna falso).

## 4. Permissões efetivas

| Papel | EXECUTE |
|---|---|
| `anon` | não |
| `authenticated` | sim |
| `service_role` | sim |

Nota: `service_role` ficou com EXECUTE porque a função foi criada pela sessão privilegiada da migração e o `REVOKE` autorizado cobria apenas `PUBLIC`, `anon` e `authenticated`. Isso não amplia o acesso de clientes: a chave de serviço já ignora a proteção por linha e só é usada no servidor. Nenhuma permissão adicional foi concedida sobre `auth.users` (anon/authenticated continuam sem SELECT).

## 5. Contagens antes/depois

| Item | Antes | Depois |
|---|---|---|
| Políticas RLS em `public` | 19 | 19 |
| Funções em `public` | 6 | 7 (a nova função) |
| Políticas usando `can_access_store` | 0 | 0 |
| Vínculos (`store_members`) | 2 ativos | 2 ativos |
| Eventos (`store_member_events`) | 2 | 2 |
| Pedidos / itens / complementos / histórico / retornos | 14 / 20 / 11 / 12 / 1 | 14 / 20 / 11 / 12 / 1 |
| Regras / uso de IA / envios / configurações / papéis / lojas | 22 / 22 / 11 / 1 / 2 / 1 | 22 / 22 / 11 / 1 / 2 / 1 |

Nenhuma política existente foi alterada ou passou a usar a função. Nenhum dado comercial, conta, papel ou vínculo foi modificado.

## 6. Testes e compilação

- 69 testes automatizados aprovados (5 arquivos).
- Compilação OK.

## 7. Verificações pendentes

- Teste funcional da função com sessões autenticadas reais (André e Ariane) não foi executado: exigiria simular identidade por sessão privilegiada, o que não está autorizado. Fica registrado como pendente; não é declarado como aprovado.
- Painel não reaberto nesta etapa (nenhuma diferença esperada: nenhuma política usa a função ainda).

## 8. Estado final

A função existe e está disponível para uso futuro pelas políticas, mas **nada mudou no acesso atual**: as políticas continuam baseadas em `user_roles`. Etapas 4 a 7 aguardam nova autorização de André.
