# OrçaObra — Relatório da Fase 1

Data: 07/11/2026, UTC. Somente a Fase 1 foi executada, após aprovação do SQL apresentado. **Nada publicado; nenhuma outra fase iniciada.**

## Backup

O proprietário confirmou exportação atualizada no bucket `database_export_07_11_26`, arquivo `orcaobra-br_261107.backup`, 439 KB, baixada e guardada em local seguro. Não foi gerada outra exportação. Não fiz verificação independente do arquivo. **Restauração não testada.**

## Alteração aplicada

Migração: `drizzle/migrations/0004_phase1_pilot_store_attribution.sql`, aplicada ao banco compartilhado do projeto, com atualização automática dos tipos gerados.

- `association_rules.store_id` e `ai_usage.store_id`: UUID anulável, default temporário da loja piloto `cd677879-a4a7-4487-bf89-411797fec356`, backfill, FK com `ON DELETE RESTRICT`.
- `quote_requests.store_id`: mesmo default temporário, sem alterar a coluna existente ou sua FK.
- Índices `association_rules_store_id_idx` e `ai_usage_store_created_idx` e comentários de escopo temporário.
- `SET LOCAL lock_timeout = '5s'` no SQL autorizado; transação gerenciada pela ferramenta, concluída sem erro.

SQL aplicado igual ao apresentado. Nenhuma alteração de telas, funções de envio, papéis, RLS, configurações, IA, limites ou conteúdo comercial. Tipos gerados refletem apenas o esquema atualizado.

## Contagens

Referência antes: consulta de 01:39:34 UTC. Conferência imediatamente após a migração: contagens idênticas nas 11 tabelas. A coluna final inclui somente o teste aprovado de gravação pela prévia.

| Tabela | Antes | Após migração | Após teste |
|---|---:|---:|---:|
| stores | 1 | 1 | 1 |
| quote_requests | 13 | 13 | 14 |
| association_rules | 22 | 22 | 22 |
| app_settings | 1 | 1 | 1 |
| ai_usage | 20 | 20 | 22 |
| submit_log | 10 | 10 | 11 |
| request_items | 19 | 19 | 20 |
| suggested_complements | 10 | 10 | 11 |
| status_history | 11 | 11 | 12 |
| followups | 1 | 1 | 1 |
| user_roles | 2 | 2 | 2 |

Os aumentos são explicados por um pedido fictício com um item, uma sugestão não aceita, um histórico inicial, um registro de envio e duas chamadas bem-sucedidas de IA (interpretação e sugestões). Os filhos do pedido foram criados às 01:41:20.671783 UTC.

## Preservação e integridade

- Loja piloto confirmada como única loja: A.S. Figueiredo Materiais de Construção.
- Defaults, duas FKs e dois índices confirmados diretamente no banco após aplicação.
- Zero loja nula e zero atribuição diferente da piloto em regras, uso de IA e pedidos; portanto nenhum vínculo inválido nessas tabelas.
- Zero filhos órfãos em itens, sugestões, histórico e retornos, antes e depois.
- As três regras ativas e revisadas continuam ativas e revisadas. Digest de todos os campos anteriores de todas as regras preservado: `ae3a8d8c21b75ec11d405def1abc9620`.
- Todos os campos dos 13 pedidos anteriores preservados: digest `d1d7e4e83fbdbf044167209b996eb525`.
- Campos anteriores dos 20 registros de IA preservados: digest `93ca1737d4c7025087c0efb065e72a30`.
- Definições de `submit_quote_request`, `rules_guard`, `guard_staff_request_update`, `guard_test_classification`, `has_role` e `is_staff` com digests idênticos antes/depois. Políticas públicas também idênticas (`3bad48144863e94e0e95361f9bc0373d`).
- André (`702b7233-45df-46fa-9656-f1ecec68d212`) e Ariane (`22157d7d-70ee-4e47-907b-4a6515bd3d66`) continuam admin. Painel verificado com a sessão de André; não foi aberto como Ariane.

## Fluxos de gravação e compatibilidade

Os inserts atuais do painel de regras e de `ai.server.ts` omitem `store_id`, recebendo automaticamente o default. A função transacional de envio continua selecionando e fornecendo a única loja em `v_store`; não foi modificada. O default do pedido é uma rede de segurança para inserts que omitam a loja, não substitui um valor explícito.

O gatilho de revisão compara apenas conteúdo da regra: atribuir loja não exige nova revisão. **Coluna anulável com default permite NULL explícito**; isso permanece um risco temporário, sem nova restrição nesta fase. Com uma única loja, os caminhos atuais de produção examinados não enviam NULL explícito para essas atribuições. O teste de permissões que omite a loja não foi executado.

## Verificação pela prévia

- Texto fictício de pedido de dois rolos de fita crepe, contato fictício e aviso para não atender nem enviar mensagens.
- Interpretação e sugestões de IA bem-sucedidas, ambas registradas com a piloto, às 01:40:58 e 01:41:10 UTC.
- Pedido `OO-Q7FC-X7UC`, ID `ffc54b6c-c56a-4aca-b5e1-e38b770902c6`, gravado com a piloto, `ai_failed=false`.
- Confirmação exibiu o mesmo protocolo. Pedido lido novamente no painel de André e marcado como teste; recarga da tela e consulta ao banco confirmaram `is_test=true`. Nenhuma conversa WhatsApp aberta.
- A primeira automação usou `check()` no switch assíncrono e encerrou antes de aguardar a resposta. A verificação foi retomada com o mesmo pedido, sem duplicar envio, e confirmou a classificação salva.
- Nenhum erro de execução de página capturado na verificação final. Evidências temporárias examinadas em `/tmp/browser/phase1/`.

## Regressão e limitações

- 69 testes automáticos aprovados antes e depois da migração (5 arquivos).
- Compilação automática: `build OK` de 01:40:18 UTC após aplicação/atualização dos tipos.
- Metadados dos dez conteúdos públicos/painel inspecionados: todos têm `head`; nenhuma alteração necessária.
- Não executada a suíte de permissões de vendedor da Fase 0B; nenhum resultado dela é considerado aprovado. Verificação real com vendedor continua pendente antes de liberar a operação da equipe.
- Esta fase **não implementa isolamento entre lojas**. Não cadastrar uma segunda loja real antes das fases e testes previstos no plano aprovado.

## Recuperação e encerramento

Nenhuma recuperação necessária ou executada. Após aplicação concluída, qualquer correção/reversão requer diagnóstico e nova autorização de André; não remover automaticamente colunas, FKs ou dados, nem restaurar o banco automaticamente.

Fase 1 concluída dentro do escopo aprovado. Código de funcionamento e versão publicada não alterados; a mudança aditiva do banco compartilhado já está em vigor. Demais fases não iniciadas.