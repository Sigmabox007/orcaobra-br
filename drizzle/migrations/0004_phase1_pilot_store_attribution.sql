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