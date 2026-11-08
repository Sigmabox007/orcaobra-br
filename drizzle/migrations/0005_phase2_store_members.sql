CREATE TABLE public.store_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  store_id   uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  role       public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_members_user_store_key UNIQUE (user_id, store_id)
);
CREATE INDEX store_members_store_id_idx ON public.store_members (store_id);

REVOKE ALL ON TABLE public.store_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.store_members TO authenticated;
GRANT ALL ON public.store_members TO service_role;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memberships readable" ON public.store_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

COMMENT ON TABLE public.store_members IS 'Fase 2: preparatória, ainda não usada por políticas/funções; user_roles segue como fonte oficial.';
COMMENT ON COLUMN public.store_members.user_id IS 'ID da conta sem chave estrangeira (regra da plataforma); exclusão de conta não remove o vínculo automaticamente. Limpeza/revogação: requisito bloqueante da Fase 3.';

INSERT INTO public.store_members (user_id, store_id, role)
SELECT ur.user_id, 'cd677879-a4a7-4487-bf89-411797fec356'::uuid, ur.role
FROM public.user_roles ur
WHERE ur.user_id IN ('702b7233-45df-46fa-9656-f1ecec68d212','22157d7d-70ee-4e47-907b-4a6515bd3d66')
  AND ur.role = 'admin';