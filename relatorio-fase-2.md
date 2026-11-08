# OrçaObra — Relatório da Fase 2

Data: 08/11/2026, UTC. **Migração aplicada após autorização explícita do SQL revisado. Nada publicado; Fase 3 não iniciada.**

## Histórico
1. Primeira tentativa (SQL com `REFERENCES auth.users(id) ON DELETE CASCADE`) interrompida antes da aplicação: a regra da plataforma só permite essa referência em `profiles` e `user_roles`.
2. SQL revisado pelo proprietário: `user_id uuid NOT NULL`, sem chave estrangeira. Demais definições preservadas. Único acréscimo: `COMMENT ON COLUMN` documentando a ausência da chave.
3. Aplicado em transação única: `drizzle/migrations/0005_phase2_store_members.sql`.

## Backup
`database_export_08_11_26/orcaobra-br_261108.backup` (443 KB, 08/11/2026). **Integridade e restauração não testadas.**

## Pré-requisitos (conferidos imediatamente antes)
André e Ariane existem como contas e admins (2); `store_members` inexistente; loja piloto existe. Sem divergência.

## Contagens antes → depois
contas 2→2, lojas 1→1, pedidos 14→14, itens 20→20, complementos 11→11, histórico 12→12, retornos 1→1, regras 22→22, uso IA 22→22, envios 11→11, configurações 1→1, papéis 2→2. Catálogo: políticas 18→19, gatilhos 3→3, funções 6→6.

## Verificações pós-migração
- `store_members`: 2 linhas, ambas da loja piloto, RLS ativo.
- Vínculos com conta existente: 2; **vínculos órfãos: 0**.
- Diferença `user_roles`(admin) × `store_members`: vazia nos dois sentidos.
- `user_roles` preservado linha a linha (md5 idêntico antes/depois: `387993801460b3e971c2eb935805ba84`).
- Permissões efetivas: anon sem SELECT/INSERT/UPDATE/DELETE/TRUNCATE; authenticated só SELECT.
- Chaves estrangeiras para `auth.users`: 0.
- Testes automáticos: 69 aprovados (5 arquivos). Compilação: build OK.

## Não verificado
Painel aberto como André/Ariane (sem mudança esperada: nada usa a tabela nova). Testes reais de vendedor (Fase 0B) continuam pendentes.

## Consequência da ausência da chave estrangeira
Apagar uma conta **não remove automaticamente** seus vínculos em `store_members`; podem surgir vínculos órfãos. Hoje isso não dá acesso a ninguém, pois nenhuma política ou função usa a tabela.

## Requisito bloqueante da Fase 3
Antes de qualquer política usar `store_members`, definir e validar (com testes) um mecanismo seguro de revogação e limpeza dos vínculos de contas excluídas. Sem isso, a Fase 3 não começa.

## Recuperação
`DROP TABLE public.store_members;` desfaz a fase sem afetar outros dados (exige autorização).
