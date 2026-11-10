# Relatório — Pré-Fase 3, Etapa 4: SQL revisado preparado, aguardando aprovação

Data: 10/11/2026. Somente leitura do banco. SQL revisado preparado para conferência, sem registro no histórico de migrações ou aplicação; nenhum dado, função, política, permissão ou tela alterado. Nada publicado.

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