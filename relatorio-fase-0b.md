# Fase 0B — Segurança dos vendedores

Data: 06/11/2026. Não publicado.

## Implementado (aplicado no banco)
- Migração aditiva `drizzle/migrations/0003_guard_staff_request_update.sql`:
  - Gatilho `guard_staff_request_update` em `quote_requests`: quem não é admin só altera `status`, `internal_notes`, `needs_followup_at`, `last_followup_at`, `updated_at` (`is_test` segue no gatilho anterior). Qualquer outra coluna: erro 42501. Exceção só quando a operação roda como `service_role`; `auth.uid()` nulo não libera nada.
  - `has_role` e `is_staff`: execução retirada de anônimos; mantida para usuários logados e servidor.
- Nenhuma tabela, coluna, dado, usuário ou papel alterado. Código do app e Fase 0A intactos.

## Conferido (consulta somente leitura)
- Gatilho novo existe e está ativo, junto com `guard_test_classification`.
- Anônimo: sem execução de `has_role`/`is_staff`. Logados e servidor: com execução.
- Contagens: pedidos 13, itens 19, complementos 10, histórico 11, retornos 1, papéis 2, lojas 1, regras 22, envios 10 — pedidos iguais à contagem antes da migração (13); demais não foram contados antes, portanto só registrados agora.
- 69 testes automáticos passando; build OK.

## NÃO executado
- Suíte `scripts/db-tests/seller_permissions.sql` (vendedor, admin e anônimo). O ambiente de testes não pode assumir o papel de usuário logado nem criar usuários fictícios; a única sessão privilegiada disponível é a de migração, e rodar a suíte por ela foi recusado (corretamente). **Nenhum resultado dessa suíte é dado como aprovado.**
- Teste de interface com vendedor real: obrigatório antes de liberar o sistema aos funcionários.
- Prévia como admin (André/Ariane) após a mudança: não verificada nesta rodada. Como o gatilho libera admins por inteiro, nenhuma mudança é esperada.

## Riscos
- P2: `has_role`/`is_staff` ainda respondem sobre outro usuário para quem está logado.
- Sem a suíte executada, as permissões negadas ao vendedor estão comprovadas só pela leitura do gatilho, não por teste.

## Recuperação
`DROP TRIGGER guard_staff_request_update ON public.quote_requests;` e `GRANT EXECUTE` de volta a `anon` nas duas funções. Segundos, sem perda de dados.
