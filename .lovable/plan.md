# Fase 1 — Preparação do banco para múltiplas lojas (plano técnico)

Somente planejamento. Nada é executado sem aprovação explícita.

**Aviso:** adicionar `store_id` NÃO isola as lojas. Depois desta fase, qualquer membro da equipe continua vendo e alterando tudo, como hoje. O isolamento só existe após as Fases 2 e 3. Nenhuma segunda loja real pode ser cadastrada antes disso.

## 1. Estado real (consultado agora, só leitura)

- Loja piloto: `cd677879-a4a7-4487-bf89-411797fec356` — "A.S. Figueiredo Materiais de Construção" (única linha em `stores`).
- Contagens: quote_requests 13 (0 sem loja), association_rules 22, app_settings 1, ai_usage 20, submit_log 10, request_items 19, suggested_complements 10, status_history 11, followups 1, user_roles 2.
- `quote_requests.store_id` já existe, com FK para `stores` (ON DELETE NO ACTION) e todos preenchidos.
- Gravações atuais: regras pelo painel (`painel.regras.tsx`, sob RLS de admin); uso de IA por `ai.server.ts` (insert em `ai_usage`); configurações por `id = 1` (`ai.server.ts`, `painel.configuracoes.tsx`); envio de pedido só pela função `submit_quote_request` (grava itens, complementos, histórico, `submit_log`).

## 2. Decisão por tabela

| Tabela | store_id? | Justificativa |
|---|---|---|
| association_rules | **Sim** | Regras de complementos serão por loja (definido na auditoria). |
| ai_usage | **Sim** | Necessário para medir uso por loja (Fase 5). O teto diário global continua contando todas as linhas, sem filtro. |
| app_settings | **Não agora** | Linha única (`id = 1`) que mistura controles globais (teto diário, liga/desliga, limites por origem) e futuros por loja. Pôr `store_id` nela fingiria ser por loja sem ser. Na Fase 5 cria-se uma tabela própria de configurações por loja; esta continua global. |
| submit_log | **Não** | Proteção contra abuso por origem — decidido que permanece global. Tabela fechada, só a função de envio grava. |
| request_items, suggested_complements, status_history, followups | **Não** | Cada linha tem `request_id` NOT NULL com FK para `quote_requests`; a loja vem do pedido, sem possibilidade de divergir. Duplicar criaria risco de inconsistência sem benefício. As políticas da Fase 3 consultarão a loja pelo pedido. |
| quote_requests | já tem | Só recebe um DEFAULT (ver seção 3). |

Total: 2 colunas novas (`association_rules.store_id`, `ai_usage.store_id`) e 1 default.

## 3. Compatibilidade com o site publicado (banco compartilhado)

- Colunas novas **anuláveis**, com `DEFAULT 'cd677879-…'` (ID literal da piloto). Qualquer insert do código publicado ou da prévia que não informe a loja recebe a piloto automaticamente — durante e depois da migração. Nenhum código precisa mudar.
- `quote_requests.store_id` recebe o mesmo DEFAULT como rede de segurança. A função `submit_quote_request` continua escolhendo "primeira loja" (não mexo nela nesta fase: é lógica de negócio). Com uma loja só, o resultado é idêntico; a troca dessa seleção fica registrada como obrigatória antes de cadastrar qualquer outra loja (Fase 4).
- Sem NOT NULL, sem CHECK novo. O default é temporário e será removido quando a loja for resolvida pelo endereço (Fase 4).
- FKs com `ON DELETE RESTRICT`: apagar a loja nunca apaga regras nem registros.
- Gatilhos existentes não são afetados: `rules_guard` compara só colunas de conteúdo (mudar `store_id` não volta regra a rascunho, o que é o desejado); `guard_staff_request_update` atua em `quote_requests`, que não ganha coluna; `guard_test_classification` intocado.
- RLS, papéis, autenticação, IA, limites e lógica: sem alteração. Nenhuma incompatibilidade inevitável encontrada.

## 4. SQL proposto (para revisão, não executado)

```sql
-- 1. Colunas aditivas com default (preenche linhas novas imediatamente)
ALTER TABLE public.association_rules
  ADD COLUMN store_id uuid DEFAULT 'cd677879-a4a7-4487-bf89-411797fec356'::uuid;
ALTER TABLE public.ai_usage
  ADD COLUMN store_id uuid DEFAULT 'cd677879-a4a7-4487-bf89-411797fec356'::uuid;
ALTER TABLE public.quote_requests
  ALTER COLUMN store_id SET DEFAULT 'cd677879-a4a7-4487-bf89-411797fec356'::uuid;

-- 2. Backfill explícito pelo ID real (no Postgres atual o ADD COLUMN com
--    default constante já preenche; o UPDATE garante e documenta)
UPDATE public.association_rules SET store_id = 'cd677879-a4a7-4487-bf89-411797fec356' WHERE store_id IS NULL;
UPDATE public.ai_usage          SET store_id = 'cd677879-a4a7-4487-bf89-411797fec356' WHERE store_id IS NULL;

-- 3. Chaves estrangeiras (após backfill)
ALTER TABLE public.association_rules
  ADD CONSTRAINT association_rules_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_usage
  ADD CONSTRAINT ai_usage_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;

-- 4. Índices para as consultas futuras
CREATE INDEX association_rules_store_id_idx ON public.association_rules(store_id);
CREATE INDEX ai_usage_store_created_idx ON public.ai_usage(store_id, created_at);

COMMENT ON COLUMN public.association_rules.store_id IS 'Loja dona da regra. Default temporário = piloto; sem isolamento até a Fase 3.';
COMMENT ON COLUMN public.ai_usage.store_id IS 'Loja atribuída ao uso. Default temporário = piloto. Teto global ignora esta coluna.';
```

Uma única migração, numa transação: ou tudo entra, ou nada. As tabelas são pequenas; travas duram milissegundos.

## 5. Ordem de execução

1. Pré-requisitos: confirmar backup recente e restaurável; registrar contagens de todas as 11 tabelas (incluindo as não alteradas) e a lista de usuários de `user_roles`.
2. Aplicar a migração.
3. Conferências (consultas só leitura):
   - contagens idênticas às do passo 1 (ou maiores apenas por pedidos/uso novos legítimos, conferidos pela data);
   - `store_id IS NULL` = 0 em association_rules, ai_usage, quote_requests;
   - nenhum `store_id` que não exista em `stores`;
   - conteúdo das regras inalterado: `reviewed`, `active`, `reviewed_at` iguais (3 ativas/revisadas continuam);
   - filhos órfãos = 0 (itens, complementos, histórico, retornos sem pedido);
   - André e Ariane continuam com papel admin.
4. Teste de gravação: um pedido de teste pela prévia (marcado como teste) e uma análise de IA; ambos com a loja piloto.
5. `bunx vitest run` (69+ passando) e build.
6. Relatório `relatorio-fase-1.md`. Sem publicação.

## 6. Riscos

- **Falsa sensação de isolamento** — mitigado pelo aviso acima e pela trava comercial.
- **Default fixo na piloto**: se outra loja fosse criada antes da Fase 4, os registros dela cairiam na piloto. Mitigado pela trava (nenhuma loja nova antes das Fases 2–4).
- **"Primeira loja" na função de envio**: mesmo risco; correção obrigatória na Fase 4.
- **Pedido novo durante a migração**: coberto pelo default e pela transação; nenhum insert falha.

## 7. Recuperação (segundos, sem perda de dados)

```sql
ALTER TABLE public.quote_requests ALTER COLUMN store_id DROP DEFAULT;
ALTER TABLE public.association_rules DROP CONSTRAINT association_rules_store_id_fkey;
ALTER TABLE public.ai_usage DROP CONSTRAINT ai_usage_store_id_fkey;
-- colunas podem permanecer (o código não as usa); remoção só com sua autorização
```

## 8. Critérios de aceitação

- Contagens antes/depois conferidas; nenhum registro excluído ou com conteúdo comercial alterado.
- Zero registros sem loja e zero vínculos inválidos nas tabelas afetadas.
- Pedido e uso de IA novos recebem a piloto automaticamente.
- Fase 0A (envio transacional, idempotência, limite) e Fase 0B (gatilho de vendedor) intactas.
- André e Ariane preservados; 69+ testes e build OK; nada publicado.
- Pendência da 0B (testes reais de vendedor) continua registrada como não executada.

## Fora do escopo

Criação de lojas, equipe por loja, RLS por loja, rotas por loja, configurações por loja, mudança na função de envio, telas, cobrança e planos.
