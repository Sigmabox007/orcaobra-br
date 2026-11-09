# OrçaObra — Relatório da Pré-Fase 3, Etapa 2

Data: 09/11/2026, UTC. Autorização restrita de André: somente a Etapa 2. **Etapas 3 a 7 não iniciadas. Nada publicado.**

## Backup
`database_export_09_11_26/orcaobra-br_261109.backup` (447 KB), confirmado pelo proprietário. Integridade e restauração não testadas.

## Migração
`drizzle/migrations/0006_prephase3_step2_member_revocation_history.sql`, uma única transação.
SQL idêntico ao autorizado, com uma única diferença: as linhas `BEGIN;` e `COMMIT;` foram retiradas, porque a ferramenta de migração não aceita esses comandos e já executa todo o conteúdo dentro de uma transação única. Se qualquer verificação interna falhasse, nada seria gravado.

## Conferências antes (somente leitura)
- `store_members` com 2 vínculos: André e Ariane, admin, loja piloto. Ambos existem como contas e como admin em `user_roles`.
- `store_member_events` não existia; colunas de revogação não existiam.
- RLS ativo em `store_members`; 19 políticas; `service_role` com BYPASSRLS.
- Contagens iguais às do relatório da Fase 2. Sem divergência.

## Contagens antes → depois
contas 2→2, lojas 1→1, pedidos 14→14, itens 20→20, complementos 11→11, histórico 12→12, retornos 1→1, regras 22→22, uso IA 22→22, envios 11→11, configurações 1→1, papéis 2→2, vínculos 2→2, eventos 0→2.

## Verificações depois
1. `store_members`: 2 vínculos ativos, sem revogação.
2. `store_member_events`: 2 eventos `concedido`, motivo "Fase 2", sem autor, um para André e um para Ariane.
3. Vínculos órfãos: 0.
4. `user_roles` igual linha a linha (md5 `387993801460b3e971c2eb935805ba84` antes e depois).
5. Dados das demais tabelas: contagens preservadas.
6. Políticas: 19 (nenhuma criada nem alterada).
7. Funções públicas 6→6; gatilhos da aplicação 3→3. Gatilhos internos de chaves estrangeiras 38→46 (+8), efeito esperado das 2 novas chaves da tabela de eventos (4 cada).
8. RLS ativo em `store_member_events`, sem política (ninguém logado lê nada ainda).
9. Permissões efetivas: anon nenhuma; authenticated só SELECT (bloqueado pelo RLS sem política); service_role só SELECT e INSERT.
10. Chaves estrangeiras do esquema público para `auth.users`: só a já existente de `user_roles`. Nenhum gatilho novo em `auth.users`.
11. Testes: 69 aprovados (5 arquivos). Compilação OK.

## Limitações
- Painel não aberto como André/Ariane (nada usa as novas colunas ou tabela).
- Nenhum teste com usuários ou lojas fictícias (não autorizado).
- Preencher `revoked_at` **ainda não revoga acesso**: as políticas seguem em `user_roles`.

## Não iniciado
Etapas 3 a 7: nenhuma função (`can_access_store`, `grant_store_member`, `revoke_store_member`, `mark_orphan_members`), rota, tela ou política nova.
