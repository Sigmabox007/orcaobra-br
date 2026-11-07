# Fase 1 — SQL para autorização

## Backup confirmado pelo proprietário

Exportação em Storage: bucket `database_export_07_11_26`, arquivo `orcaobra-br_261107.backup`, tamanho informado de **439 KB**. O proprietário confirmou que baixou e guardou o arquivo em local seguro no computador. Não será solicitada outra exportação.

**A restauração não foi testada.** A confirmação acima é do proprietário; não representa uma verificação independente do arquivo ou de sua restauração.

## Escopo preservado

Somente a Fase 1 aprovada: adicionar `store_id` a `association_rules` e `ai_usage`, preencher com a loja piloto, criar suas chaves estrangeiras e índices e definir o mesmo default em `quote_requests.store_id`. Nenhuma mudança em telas, funções de envio, políticas RLS, papéis, limites, IA ou configurações. Nenhuma outra fase e nenhuma publicação.

**Isso não isola lojas.** Não cadastrar uma segunda loja real antes das etapas e testes de isolamento e resolução da loja previstos no plano aprovado. Os defaults são temporários; colunas anuláveis ainda aceitam `NULL` explícito.

## Migração SQL proposta — ainda não aplicada

O SQL abaixo será enviado integralmente à ferramenta de migração **somente depois da sua autorização**. A ferramenta gerencia a transação; por isso não há `BEGIN`/`COMMIT` no SQL. `SET LOCAL lock_timeout` limita a espera por cada trava a cinco segundos e vale apenas na transação da migração. Uma falha aborta a transação, sem alterações parciais.

```sql
SET LOCAL lock_timeout = '5s';

-- 1. Colunas aditivas, anuláveis, com default temporário da piloto
ALTER TABLE public.association_rules
  ADD COLUMN store_id uuid DEFAULT 'cd677879-a4a7-4487-bf89-411797fec356'::uuid;
ALTER TABLE public.ai_usage
  ADD COLUMN store_id uuid DEFAULT 'cd677879-a4a7-4487-bf89-411797fec356'::uuid;
ALTER TABLE public.quote_requests
  ALTER COLUMN store_id SET DEFAULT 'cd677879-a4a7-4487-bf89-411797fec356'::uuid;

-- 2. Backfill aditivo explícito pelo ID real da piloto
UPDATE public.association_rules
  SET store_id = 'cd677879-a4a7-4487-bf89-411797fec356'::uuid
  WHERE store_id IS NULL;
UPDATE public.ai_usage
  SET store_id = 'cd677879-a4a7-4487-bf89-411797fec356'::uuid
  WHERE store_id IS NULL;

-- 3. Chaves estrangeiras após o backfill, sem exclusão em cascata
ALTER TABLE public.association_rules
  ADD CONSTRAINT association_rules_store_id_fkey
  FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_usage
  ADD CONSTRAINT ai_usage_store_id_fkey
  FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;

-- 4. Índices para consultas futuras
CREATE INDEX association_rules_store_id_idx
  ON public.association_rules(store_id);
CREATE INDEX ai_usage_store_created_idx
  ON public.ai_usage(store_id, created_at);

COMMENT ON COLUMN public.association_rules.store_id IS
  'Loja dona da regra. Default temporário = piloto; sem isolamento até a Fase 3.';
COMMENT ON COLUMN public.ai_usage.store_id IS
  'Loja atribuída ao uso. Default temporário = piloto. Teto global ignora esta coluna.';
```

Não há novas tabelas ou mudanças de permissões; os grants e as políticas existentes permanecem intactos. Não há scripts de teste dentro da migração.

## Execução após autorização

1. Consultar o estado atual, confirmar a loja piloto e registrar as contagens das 11 tabelas e os usuários/papéis de `user_roles`, antes da migração. Guardar a referência dos conteúdos e estados de revisão das regras. Verificar os caminhos atuais de gravação quanto a `NULL` explícito.
2. Aplicar exclusivamente o SQL acima em uma transação. Se houver divergência de estrutura ou pré-requisitos, interromper e apresentar o diagnóstico antes de modificar o SQL.
3. Conferir contagens antes/depois; aumentos somente se explicados por novos registros legítimos. Conferir ausência de loja nula ou inválida nas três tabelas, ausência de filhos órfãos, preservação de regras/revisões e dos papéis admin de André e Ariane.
4. Fazer o pedido de teste e a análise de IA pela prévia, confirmar sua atribuição à piloto e marcar o pedido como teste pelo administrador, como previsto no plano aprovado.
5. Executar os testes automáticos e conferir a compilação automática. Não executar a suíte de permissões como migração; a pendência dos testes reais de vendedor da Fase 0B permanece **não executada**.
6. Registrar os resultados e limitações em `relatorio-fase-1.md`, sem publicação.

## Recuperação

Se a migração falhar, a transação será abortada. Após uma aplicação concluída, qualquer problema exige diagnóstico e proposta para nova autorização de André: não remover automaticamente colunas, chaves estrangeiras ou registros, nem executar restauração automática.