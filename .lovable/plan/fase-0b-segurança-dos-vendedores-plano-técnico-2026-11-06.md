# Fase 0B — Segurança dos vendedores (plano técnico)

Somente planejamento. Nada de código, banco, usuários ou versão publicada é alterado nesta etapa. Fase 0A não é tocada.

## 1. O que hoje permite alterações por vendedores (verificado)

Vendedor = qualquer usuário com papel em `user_roles` (`is_staff`).


| Tabela                                                                       | Política atual                                     | Problema                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quote_requests` UPDATE                                                      | `is_staff` em USING e CHECK, sem limite de colunas | Vendedor pode alterar nome, WhatsApp, texto original, interpretação da IA, esclarecimentos, categoria, protocolo, loja, consentimento, `ai_failed`, chaves de envio, datas de criação. Só `is_test` já é protegido (gatilho `guard_test_classification`). |
| `quote_requests` DELETE                                                      | só admin                                           | OK                                                                                                                                                                                                                                                        |
| `status_history` INSERT                                                      | staff e `changed_by = auth.uid()`                  | Pode gravar histórico sem que o status mude ou com `from_status` falso. Risco baixo; mantido, ver item 4.                                                                                                                                                 |
| `followups` INSERT                                                           | staff e `user_id = auth.uid()`                     | OK                                                                                                                                                                                                                                                        |
| `request_items`, `suggested_complements`, `stores`, `ai_usage`, `submit_log` | sem escrita para equipe                            | OK                                                                                                                                                                                                                                                        |
| `association_rules` escrita                                                  | só admin                                           | OK                                                                                                                                                                                                                                                        |
| `app_settings` UPDATE                                                        | só admin                                           | OK                                                                                                                                                                                                                                                        |
| `user_roles`                                                                 | sem escrita pelo app                               | OK (vendedor não cria admin nem muda papéis)                                                                                                                                                                                                              |
| Funções `has_role`, `is_staff`                                               | SECURITY DEFINER, caminho fixo                     | Ambas aceitam qualquer `_user_id`: um usuário logado pode perguntar se outro id é admin. Vazamento pequeno; corrigido no item 2. `submit_quote_request` já é só do servidor (0A).                                                                         |


Escritas do painel que o vendedor usa hoje: `status` + `updated_at`; `internal_notes` + `needs_followup_at`; `last_followup_at`; inserts em `status_history` e `followups`. Tudo isso continua funcionando.

## 2. Solução escolhida (mais simples e segura)

Um gatilho no banco, no mesmo padrão do `guard_test_classification` já existente. Permissão por coluna (GRANT por coluna) não serve, porque admin e vendedor usam o mesmo papel de acesso ao banco.

Gatilho `guard_staff_request_update` (BEFORE UPDATE em `quote_requests`):

- Se o usuário é admin: nada muda (André e Ariane preservam o acesso atual).
- Se não é admin: só podem mudar `status`, `internal_notes`, `needs_followup_at`, `last_followup_at`, `updated_at`. Qualquer outra coluna diferente do valor antigo gera erro de permissão (42501), com mensagem em português.
- Chamadas do servidor com chave de serviço (sem usuário) não são afetadas.
- `is_test` continua protegido pelo gatilho atual (sem duplicar).

Ajuste nas funções SECURITY DEFINER (sem mudar resultado para quem consulta a si mesmo):

- `has_role` e `is_staff`: negar execução para visitantes anônimos (`REVOKE EXECUTE ... FROM anon, public`; manter `authenticated` e `service_role`).
- Consultar papel de outro usuário: as políticas sempre passam `auth.uid()`, e `deleteQuoteRequest` também; o vazamento restante é só "id X é admin?" para quem já é da equipe ou logado. Proposta: deixar como está nesta fase e registrar como risco P2, porque mudar a assinatura afetaria todas as políticas. Se preferirem, posso incluir uma checagem `_user_id = auth.uid() OR auth.uid() IS NULL` — exige teste extra nas políticas de admin.

Nenhuma tela muda. Botões de admin já estão ocultos para vendedor; agora o banco também bloqueia.

## 3. Arquivos e migração

- Migração nova, aditiva: função + gatilho `guard_staff_request_update`; REVOKE de execução para anônimos em `has_role`/`is_staff`. Nenhuma tabela, coluna ou dado alterado.
- `scripts/db-tests/seller_permissions.sql` (novo): testes no banco, tudo dentro de transação desfeita ao final.
- `AGENTS.md`: atualizar a regra dos gatilhos (inclui campos permitidos ao vendedor).
- `relatorio-fase-0b.md` (novo).
- Código do app: nenhuma mudança prevista.

## 4. Testes diretos no banco/API (sem tocar dados reais)

Executados numa transação que termina em ROLLBACK, simulando o usuário com `set local role authenticated` + `request.jwt.claims`. Dentro dela: cria-se um usuário fictício de vendedor (papel `seller`) e um pedido fictício via `submit_quote_request`; tudo desaparece ao final. Contagens por tabela antes/depois devem ser idênticas.

Permitido ao vendedor (deve passar):

- ler pedidos, itens, complementos, histórico, retornos;
- mudar `status`; gravar `status_history` com `changed_by` = ele;
- editar `internal_notes`, `needs_followup_at`, `last_followup_at`;
- registrar `followups` com `user_id` = ele.

Negado ao vendedor (deve falhar ou afetar 0 linhas):

- alterar cada coluna proibida, uma por vez: `customer_name`, `customer_whatsapp`, `customer_notes`, `original_text`, `ai_interpretation`, `clarifications`, `category`, `ai_failed`, `protocol`, `store_id`, `consent_at`, `is_test`, `submission_key/hash/origin`, `created_at`;
- excluir pedido; inserir pedido direto;
- alterar/inserir/excluir itens, complementos, regras, configurações, lojas;
- inserir/alterar `user_roles` (criar admin);
- gravar `status_history`/`followups` em nome de outro usuário.

Admin (deve continuar passando): todas as alterações atuais do painel, inclusive marcação de teste e exclusão (testada em pedido fictício).

Anônimo: nenhuma tabela legível; `has_role`/`is_staff` sem execução.

Teste de ponta a ponta (opcional): login de vendedor na prévia para conferir que o painel funciona. **Depende de uma conta de teste com e-mail, que eu não crio sem sua autorização.** Sem ela, a prova fica apenas no banco (que é onde a regra vale) e na prévia como admin.

Testes automáticos atuais (69) continuam passando.

## 5. Riscos

- Alguma tela de vendedor gravar campo não previsto e passar a dar erro. Mitigação: mapeamento acima cobre todas as gravações atuais; teste com admin e vendedor.
- O gatilho chama `has_role` a cada atualização: custo desprezível no volume atual.
- Site publicado só recebe o bloqueio no banco (que é compartilhado) assim que a migração for aplicada; como a regra é só para não-admins e não há vendedores hoje, não há impacto nos 2 admins.

## 6. Requisitos antes da migração e recuperação

- Confirmar cópia de segurança recente; contagem de registros por tabela antes/depois.
- Recuperação: `DROP TRIGGER guard_staff_request_update` e `GRANT EXECUTE` de volta — segundos, sem perda de dados. Código antigo continua compatível.

## 7. Critérios de aceitação

- Vendedor fictício: todas as ações permitidas passam; todas as proibidas falham no banco.
- André e Ariane: painel funciona igual (status, notas, retornos, teste, exclusão, regras, configurações).
- Anônimo sem acesso a tabelas nem às funções de papel.
- Contagens idênticas antes/depois; nenhum usuário ou papel alterado; 69+ testes passam; build OK; sem publicação.

## ## Decisões finais aprovadas

1. Não criar conta de vendedor de teste nesta fase. Realizar todos os testes de permissões com usuário fictício dentro de transações revertidas por ROLLBACK. Registrar que o teste da interface com vendedor real permanece obrigatório antes de liberar o sistema aos funcionários.

2. Adiar a restrição de consulta apenas ao próprio papel em has_role/is_staff. Registrar como risco P2. Nesta fase, retirar somente a execução por anônimos, garantindo que as políticas existentes continuem funcionando.

3. O gatilho deve permitir exceção privilegiada somente quando a operação estiver efetivamente autenticada como service_role; auth.uid() nulo, isoladamente, não concede exceção.

4. Preservar integralmente os acessos administrativos de André e Ariane e todas as funcionalidades da Fase 0A.

5. Executar os testes previstos, confirmar as contagens antes/depois e entregar o relatório da Fase 0B. Não publicar alterações de interface.