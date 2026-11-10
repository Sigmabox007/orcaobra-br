# Relatório — Pré-Fase 3, Etapa 4: aplicada e verificada

Data: 10/11/2026. Etapa 4 aplicada após autorização expressa de execução direta de André, recebida às 06:38 UTC. Somente as três funções e suas permissões previstas foram adicionadas. Nada publicado; Etapas 5–7 não iniciadas.

## Resultado final — execução direta autorizada

### Aplicação e fidelidade

- Histórico inspecionado imediatamente antes: consistente, sem achados e somente entradas 0000–0007. Nenhuma outra migração pendente identificada.
- Os 13 grupos de pré-requisitos foram reconferidos por SELECT imediatamente antes da aplicação e todos retornaram true.
- Aplicada somente `drizzle/migrations/0008_prephase3_step4_member_management_functions.sql` pela ferramenta de migrações, em transação atômica gerenciada pelo mecanismo. Os blocos DO de pré/pós-condições fazem parte da mesma transação; uma exceção impede sua confirmação. Não foram acrescentados BEGIN/COMMIT nem executada uma segunda migração.
- SHA-256 do arquivo aplicado e do documento autorizado: ambos `0a0725df4bf46d317c8fec6f4eb5dabd9b1cd2441926e2579967ef1fc08d8dd4`. O SQL aplicado é byte a byte idêntico ao autorizado.
- Tipos do cliente atualizados automaticamente pela ferramenta. Nenhuma tela, rota, função de servidor ou agendamento criado/alterado.

### Funções e permissões efetivas — verificadas após aplicação

As três funções existem com proprietário postgres, SECURITY DEFINER, VOLATILE e configuração `search_path=""` (vazia). Total de funções públicas: 10.

| Função | PUBLIC | anon | authenticated | service_role |
|---|---|---|---|---|
| grant_store_member | sem EXECUTE | sem EXECUTE | sem EXECUTE | sem EXECUTE |
| revoke_store_member | sem EXECUTE | sem EXECUTE | sem EXECUTE | sem EXECUTE |
| mark_orphan_members | sem EXECUTE | sem EXECUTE | sem EXECUTE | EXECUTE |

PUBLIC foi conferido na ACL; os outros papéis, por has_function_privilege. O proprietário conserva seus poderes inerentes. Nenhuma das três funções foi chamada para conceder, revogar, reativar ou limpar vínculos reais.

Permissões diretas reconferidas por has_table_privilege para SELECT/INSERT/UPDATE/DELETE/TRUNCATE:

- anon: nenhuma das cinco operações nas duas tabelas de vínculo/histórico ou em auth.users.
- authenticated: somente SELECT nas duas tabelas; nenhuma das cinco operações em auth.users.
- service_role: somente SELECT/INSERT no histórico; permissões preexistentes nas demais tabelas não alteradas.
- RLS das duas tabelas permanece habilitada. Histórico continua sem política; nenhuma política usa can_access_store. SELECT concedido no histórico a authenticated não permite ler linhas sem política.
- Uma FK de public.user_roles para auth.users; nenhuma FK de store_members/store_member_events para auth.users. Zero vínculos órfãos.
- André e Ariane continuam com vínculos admin ativos, sem revoked_at/revoked_by/revoke_reason, contas existentes, não excluídas nem bloqueadas.

### Preservação integral dos dados e das proteções existentes

As contagens e os digests MD5 do conteúdo completo de cada conjunto, ordenado pela chave, foram comparados antes/depois. **Todos iguais**, incluindo os 2 vínculos, 2 eventos, user_roles, as 19 políticas e definições/ACLs das 7 funções públicas preexistentes.

| Conjunto | Linhas antes/depois | Digest antes/depois |
|---|---:|---|
| Vínculos | 2 | 0e21360c2611a03f48c24202e180cf3a |
| Eventos | 2 | c1b5ccfde230ac9d0b9f146af9db9068 |
| Papéis | 2 | e36c643ab84860ec89edbe83571ca417 |
| Pedidos | 14 | 339af75cadb0bfd305c225a3e54f5a13 |
| Itens | 20 | 082d939af78c46b59999b500b01bfd6d |
| Complementos | 11 | 2b4bd3a476b3741296247bd5dd048fef |
| Histórico de status | 12 | ed8bf430b52c374bbbffa1f38950ed06 |
| Retornos | 1 | bdefc132ec6ba11ae9f9075608851e5e |
| Regras | 22 | 8b7fed52f5b51d906f20d39965ea3353 |
| Uso de IA | 22 | 0965b7931c70a37e44619f43370db586 |
| Envios | 11 | 32ed63e7662b116bb736dedfbaf5315f |
| Configurações | 1 | 4f287ff7a0ffe1e9346cb9d32f1bf188 |
| Lojas | 1 | fb709f627b04b99822cd06df6085a66c |
| Políticas públicas | 19 | f187befab1082673ef08549a6898b025 |
| Funções/ACLs anteriores | 7 | 0a3930130057a4070d01f3dd792d383c |

### Testes e compilação

- `bunx vitest run`: **69 testes aprovados, 5 arquivos**, após aplicação.
- Compilação automática: **build OK**, registro de 10/11/2026 às 06:40:41 UTC em /tmp/observability/build-errors.log, consultado após atualização dos tipos.
- Pré/pós-condições da migração e conferências de catálogo/integridade/permissões: aprovadas. Nenhuma divergência ou correção adicional.

### Pendências e limite da conclusão

- Testes de execução das funções (concessão, idempotência, mudança de papel, último admin, concorrência, revogação, reativação e órfãos): **não executados**; dependem de ambiente/procedimento isolado e autorização próprios. Os 69 testes existentes não validam esses cenários no banco.
- Teste deliberado de rollback com falha: não executado; atomicidade é a garantia do mecanismo usado, não um teste de falha realizado nesta etapa.
- Não foram simuladas identidades, criadas contas/lojas fictícias, alteradas contas reais ou reaberto o painel como André/Ariane. A preservação do acesso foi conferida pelo estado dos vínculos, papéis, políticas e funções existentes, não por teste autenticado de interface.
- Nenhuma interface de gestão liberada; nenhuma rotina de limpeza agendada. As políticas atuais continuam baseadas em user_roles: a Etapa 4, isoladamente, não faz revogação de acesso por store_members nem isolamento entre lojas.
- Mecanismo seguro de revogação/limpeza de contas excluídas permanece bloqueante da Fase 3 até validação funcional completa. Etapas 5, 6 e 7 não autorizadas; plano geral não aprovado; nada publicado.

**Trabalho encerrado no escopo autorizado.** As seções seguintes são histórico das preparações/interrupções anteriores, não o estado atual.

## Atualização — SQL revisado recebido às 06:27 UTC

O novo anexo `pre_fase3_etapa4_sql_para_lovable_1.txt` substitui integralmente a referência anterior. Lido integralmente, com SHA-256 confirmado:

```text
0a0725df4bf46d317c8fec6f4eb5dabd9b1cd2441926e2579967ef1fc08d8dd4
```

Comparação dos dois arquivos: somente as duas verificações de search_path (pré/pós) e o bloco de verificação de FKs foram modificados. Os três corpos de funções e suas permissões permanecem byte a byte inalterados.

Todos os 13 grupos de conferência por SELECT retornaram true: dependências, ausência das funções da Etapa 4, vínculos/eventos, administradores válidos, contagens do catálogo, dono/segurança/search_path, permissões existentes, RLS, colunas obrigatórias, enum, FKs da aplicação, ausência de políticas usando can_access_store e ausência de órfãos. As permissões diretas foram reconferidas nas cinco operações. As condições de tabelas do pós-check, avaliáveis antes da aplicação, também passaram; os dois vínculos continuam sem marcações de revogação.

Histórico novamente inspecionado: consistente, sem achados, entradas 0000–0007. Nenhuma migração pendente fora do escopo identificada. Contagens comerciais e os dois papéis admin permanecem iguais aos registrados abaixo.

SQL efetivo preparado, integral e sem modificações, em `docs/0008_prephase3_step4_member_management_functions.sql`, com cópia para conferência em Files. **Não foi criado arquivo em drizzle/migrations nem alterado o journal**: a ferramenta disponível aplica imediatamente, portanto não foi chamada antes da aprovação explícita exigida por André.

Próximo passo bloqueado: conferência e aprovação de André sobre o SQL apresentado. Antes de eventual aplicação, reconferir pré-requisitos imediatamente e usar o conteúdo integral, em transação gerenciada única. Testes automatizados, compilação e pós-condições das funções novas permanecem não executados nesta preparação; auditoria independente, testes funcionais isolados e rollback deliberadamente falho não são declarados validados. Etapas 5–7 e publicação continuam não autorizadas.

As seções abaixo preservam o diagnóstico histórico do anexo anterior; seus dois bloqueios foram resolvidos pelo novo SQL, não por mudanças no banco.

## 1. Referência autorizada

Arquivo lido integralmente: `pre_fase3_etapa4_sql_para_lovable.txt`, 510 linhas.

SHA-256 obtido e igual ao informado por André:

```text
41678956134e250c5bd0994c45b36dee3c4d8daa59d4c41a7b6fffe88d779a09
```

O SQL não foi reconstruído, simplificado nem corrigido. Conforme os itens 3 e 6 da autorização, a operação foi interrompida antes de aplicar qualquer alteração. A apresentação do SQL efetivo para aprovação permanece pendente de resolver as incompatibilidades abaixo; não houve chamada à ferramenta de aplicação de migração.

## 2. Incompatibilidades confirmadas por leitura

### 2.1. Comparação literal de `search_path` no pré-check

Nas linhas 59–69, o SQL exige:

```sql
AND 'search_path=' = ANY(p.proconfig)
```

O valor real de `can_access_store.proconfig` é um array cujo elemento é `search_path=""`, e não `search_path=`. Uma consulta de leitura executando exatamente a comparação do anexo retornou **false**. A função tem efetivamente search_path vazio, proprietário `postgres` e SECURITY DEFINER: a incompatibilidade está na representação literal esperada pelo verificador, não em uma ausência de proteção na função existente.

Assim, o pré-check do anexo lançaria `Proprietário/segurança/search_path de can_access_store divergente` antes dos CREATE FUNCTION. O mesmo padrão de comparação aparece no pós-check das três funções novas (linhas 410–425), que também precisa ser revisado pelo responsável pelo SQL.

### 2.2. Contagem de referências a `auth.users` no pós-check

Nas linhas 490–496, o SQL conta **todas** as chaves estrangeiras que referenciam `auth.users`, sem restringir o esquema da tabela de origem, e exige 1.

Resultado real confirmado por leitura:

| Origem das referências | Quantidade |
|---|---:|
| `public` | 1 (`public.user_roles`, `user_roles_user_id_fkey`) |
| `auth` — tabelas gerenciadas pela plataforma | 10 |
| Total da consulta exata do anexo | **11** |

Portanto o pós-check lançaria `Referências a auth.users divergentes`, revertendo a transação mesmo se o primeiro bloqueio fosse superado. Nenhuma referência foi criada ou removida nesta etapa. Não se deve alterar as tabelas gerenciadas de autenticação para satisfazer essa contagem.

## 3. Demais conferências feitas somente por leitura

- Histórico de migrações inspecionado pela ferramenta da plataforma: consistente, sem achados; entradas 0000 a 0007, iguais à sequência local. Nenhuma migração pendente fora do escopo identificada.
- 7 funções públicas e 19 políticas públicas; nenhuma das três funções da Etapa 4 existe.
- 2 vínculos ativos, ambos admin da loja piloto, com contas existentes, não excluídas e não bloqueadas (André e Ariane).
- 0 vínculos órfãos; 2 eventos `concedido`, origem `Fase 2`, actor_id nulo.
- Enum `app_role`: exatamente `admin` e `seller`.
- Colunas obrigatórias de `store_members` compatíveis com o INSERT previsto; `id` e `created_at` têm DEFAULT.
- `can_access_store`: proprietário postgres, SECURITY DEFINER, STABLE; anon sem EXECUTE e authenticated com EXECUTE.
- RLS habilitada nas duas tabelas de vínculos/histórico; o histórico permanece sem política de leitura.
- `anon`: sem SELECT, INSERT, UPDATE, DELETE e TRUNCATE nas duas tabelas e em `auth.users`.
- `authenticated`: somente SELECT nas duas tabelas, sem acesso direto a `auth.users` nas cinco operações conferidas. SELECT concedido no histórico não permite ler linhas enquanto não houver política RLS.
- `service_role`: SELECT e INSERT no histórico; sem UPDATE, DELETE e TRUNCATE. `postgres` possui SELECT em `auth.users`.
- Papéis de André e Ariane continuam admin em `user_roles`.

Contagens observadas, iguais às registradas no fim da Etapa 3:

| Item | Quantidade |
|---|---:|
| Lojas | 1 |
| Pedidos | 14 |
| Itens | 20 |
| Complementos sugeridos | 11 |
| Histórico de status | 12 |
| Retornos | 1 |
| Regras | 22 |
| Uso de IA | 22 |
| Registros de envio | 11 |
| Configurações | 1 |
| Papéis | 2 |
| Vínculos | 2 |
| Eventos de vínculo | 2 |

Essas conferências não equivalem à aprovação dos testes funcionais das novas funções, que não foram criadas.

## 4. Não executado e próximo requisito

- Migração `0008_prephase3_step4_member_management_functions`: **não criada nem aplicada**.
- Nenhuma concessão, revogação, reativação ou limpeza de vínculo real executada.
- Testes automatizados existentes e compilação: **não executados nesta etapa**, pois a instrução foi interromper diante de qualquer divergência e realizá-los após aprovação/aplicação. Não se declara compilação aprovada com base em resultados de etapas anteriores.
- Testes funcionais, concorrência, último administrador, reativação e contas órfãs: não executados; nenhum dado fictício ou identidade privilegiada simulada.
- Auditoria independente, plano funcional isolado e teste de rollback deliberadamente falho: não comprovados nesta etapa.
- Aguarda SQL revisado por André/responsável pela revisão dos dois verificadores, nova conferência e apresentação do SQL efetivo antes de aprovação explícita para aplicação. Nenhuma correção automática foi feita.
- Etapas 5, 6 e 7 não iniciadas; nenhuma interface de gestão liberada. O mecanismo de revogação/limpeza permanece bloqueante da Fase 3 até definição e validação completas. As políticas de acesso atuais continuam inalteradas.