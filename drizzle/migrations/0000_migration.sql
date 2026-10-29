create type public.app_role as enum ('admin','seller');
create type public.request_status as enum ('recebido','esclarecimento','preparacao','orcamento_enviado','aguardando_retorno','convertido','perdido');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp text,
  created_at timestamptz not null default now()
);
grant select on public.stores to authenticated;
grant all on public.stores to service_role;
alter table public.stores enable row level security;
create policy "staff read stores" on public.stores for select to authenticated using (public.is_staff(auth.uid()));
insert into public.stores (name) values ('A.S. Figueiredo Materiais de Construção');

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  protocol text not null unique,
  customer_name text not null,
  customer_whatsapp text not null,
  customer_notes text,
  consent_at timestamptz not null,
  original_text text not null,
  ai_interpretation jsonb,
  clarifications jsonb not null default '[]'::jsonb,
  category text,
  status request_status not null default 'recebido',
  needs_followup_at timestamptz,
  last_followup_at timestamptz,
  internal_notes text,
  ai_failed boolean not null default false,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.quote_requests to authenticated;
grant all on public.quote_requests to service_role;
alter table public.quote_requests enable row level security;
create policy "staff read requests" on public.quote_requests for select to authenticated using (public.is_staff(auth.uid()));
create policy "staff update requests" on public.quote_requests for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "admin delete requests" on public.quote_requests for delete to authenticated using (public.has_role(auth.uid(),'admin'));
grant delete on public.quote_requests to authenticated;
create index on public.quote_requests (created_at desc);

create table public.request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests(id) on delete cascade,
  origin text not null check (origin in ('original','complement')),
  name text not null,
  quantity text,
  note text,
  created_at timestamptz not null default now()
);
grant select on public.request_items to authenticated;
grant all on public.request_items to service_role;
alter table public.request_items enable row level security;
create policy "staff read items" on public.request_items for select to authenticated using (public.is_staff(auth.uid()));

create table public.association_rules (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('pisos','sanitarios','pintura')),
  trigger text not null,
  complement text not null,
  condition text,
  clarifying_question text,
  explanation text not null,
  reviewed boolean not null default false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.association_rules to authenticated;
grant all on public.association_rules to service_role;
alter table public.association_rules enable row level security;
create policy "staff read rules" on public.association_rules for select to authenticated using (public.is_staff(auth.uid()));
create policy "admin insert rules" on public.association_rules for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admin update rules" on public.association_rules for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin delete rules" on public.association_rules for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.rules_guard() returns trigger language plpgsql as $$
begin
  if new.active and not new.reviewed then
    raise exception 'Regra precisa ser revisada antes de ser ativada';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger rules_guard before insert or update on public.association_rules for each row execute function public.rules_guard();

create table public.suggested_complements (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests(id) on delete cascade,
  rule_id uuid references public.association_rules(id) on delete set null,
  name text not null,
  reason text,
  accepted boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.suggested_complements to authenticated;
grant all on public.suggested_complements to service_role;
alter table public.suggested_complements enable row level security;
create policy "staff read suggestions" on public.suggested_complements for select to authenticated using (public.is_staff(auth.uid()));

create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests(id) on delete cascade,
  from_status request_status,
  to_status request_status not null,
  changed_by uuid,
  note text,
  created_at timestamptz not null default now()
);
grant select, insert on public.status_history to authenticated;
grant all on public.status_history to service_role;
alter table public.status_history enable row level security;
create policy "staff read history" on public.status_history for select to authenticated using (public.is_staff(auth.uid()));
create policy "staff insert history" on public.status_history for insert to authenticated with check (public.is_staff(auth.uid()) and changed_by = auth.uid());

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests(id) on delete cascade,
  user_id uuid not null,
  note text,
  created_at timestamptz not null default now()
);
grant select, insert on public.followups to authenticated;
grant all on public.followups to service_role;
alter table public.followups enable row level security;
create policy "staff read followups" on public.followups for select to authenticated using (public.is_staff(auth.uid()));
create policy "staff insert followups" on public.followups for insert to authenticated with check (public.is_staff(auth.uid()) and user_id = auth.uid());

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('interpret','suggest')),
  origin_hash text not null,
  session_id text,
  success boolean not null,
  created_at timestamptz not null default now()
);
grant select on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;
alter table public.ai_usage enable row level security;
create policy "staff read ai usage" on public.ai_usage for select to authenticated using (public.is_staff(auth.uid()));
create index on public.ai_usage (created_at);
create index on public.ai_usage (origin_hash, created_at);

create table public.submit_log (
  id uuid primary key default gen_random_uuid(),
  origin_hash text not null,
  created_at timestamptz not null default now()
);
grant all on public.submit_log to service_role;
alter table public.submit_log enable row level security;

create table public.app_settings (
  id int primary key default 1 check (id = 1),
  ai_enabled boolean not null default true,
  ai_daily_global_limit int not null default 300,
  ai_per_origin_hour int not null default 6,
  ai_per_origin_day int not null default 20,
  ai_per_session int not null default 4,
  submits_per_origin_hour int not null default 5,
  updated_at timestamptz not null default now()
);
grant select, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "staff read settings" on public.app_settings for select to authenticated using (public.is_staff(auth.uid()));
create policy "admin update settings" on public.app_settings for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
insert into public.app_settings (id) values (1);

-- Regras-semente em RASCUNHO (não revisadas, inativas)
insert into public.association_rules (category, trigger, complement, condition, clarifying_question, explanation) values
('pisos','piso / porcelanato / cerâmica','Argamassa colante','Tipo de argamassa (AC-I, AC-II, AC-III) depende do piso e do ambiente','O piso é cerâmico ou porcelanato? Área interna ou externa?','Necessária para assentar o piso; a loja indica o tipo compatível.'),
('pisos','piso / porcelanato / cerâmica','Rejunte','Cor e tipo conforme o piso e o ambiente','Qual a cor do piso?','Preenche as juntas entre as peças.'),
('pisos','piso / porcelanato / cerâmica','Espaçadores (cruzetas)','Espessura conforme a junta indicada pelo fabricante',null,'Ajudam a manter juntas uniformes.'),
('pisos','piso / porcelanato / cerâmica','Desempenadeira dentada',null,null,'Ferramenta para espalhar a argamassa.'),
('pisos','piso / porcelanato / cerâmica','Nível',null,null,'Ajuda a conferir o nivelamento durante o assentamento.'),
('pisos','rejunte','Esponja para limpeza do rejunte',null,null,'Remove o excesso de rejunte da superfície.'),
('pisos','porcelanato grande formato','Sistema de nivelamento (clips e cunhas)','Indicado para peças grandes','Qual o tamanho das peças?','Reduz desníveis entre peças grandes.'),
('sanitarios','vaso sanitário','Anel de vedação','Modelo depende da saída do vaso','O vaso tem saída vertical ou horizontal?','Veda a ligação do vaso com o esgoto.'),
('sanitarios','vaso sanitário','Parafusos de fixação para vaso',null,null,'Fixam o vaso ao piso.'),
('sanitarios','vaso sanitário / caixa acoplada','Engate flexível','Comprimento conforme a distância até o registro','Já existe ponto de água no local?','Liga a caixa acoplada ao ponto de água.'),
('sanitarios','pia / lavatório','Sifão','Modelo depende da cuba e da saída de esgoto',null,'Liga a saída da pia ao esgoto e evita mau cheiro.'),
('sanitarios','pia / lavatório','Engate flexível','Comprimento conforme a instalação',null,'Liga a torneira ao ponto de água.'),
('sanitarios','pia / lavatório','Válvula de escoamento','Compatível com a cuba',null,'Faz o escoamento da água da cuba.'),
('sanitarios','instalação hidráulica','Fita veda-rosca',null,null,'Veda conexões roscáveis.'),
('pintura','pintura de parede','Rolo de pintura','Tipo de lã depende da textura da parede e da tinta','A parede é lisa ou tem textura?','Para aplicar a tinta em áreas maiores.'),
('pintura','pintura de parede','Pincel',null,null,'Para cantos e acabamentos.'),
('pintura','pintura de parede','Bandeja de pintura',null,null,'Para carregar o rolo com tinta.'),
('pintura','pintura de parede','Fita crepe',null,null,'Protege rodapés, batentes e tomadas.'),
('pintura','pintura de parede','Lixa para parede','Grão conforme o estado da superfície','A parede já foi pintada antes?','Prepara a superfície antes da pintura.'),
('pintura','parede nova / reboco','Selador acrílico','Indicado para reboco novo ou poroso','A parede é nova (reboco) ou já pintada?','Uniformiza a absorção da superfície.'),
('pintura','parede com imperfeições','Massa corrida / massa acrílica','Interna (corrida) ou externa (acrílica)','Área interna ou externa?','Corrige pequenas imperfeições.'),
('pintura','pintura','Lona plástica para proteção',null,null,'Protege piso e móveis.');

-- Dados de TESTE claramente marcados
with s as (select id from public.stores limit 1)
insert into public.quote_requests (store_id, protocol, customer_name, customer_whatsapp, consent_at, original_text, category, status, is_test, created_at)
select s.id, v.p, v.n, '00000000000', now(), v.t, v.c, v.st::request_status, true, now() - v.ago::interval from s,
(values
 ('TESTE-0001','Cliente Teste 01','Preciso de 20 m² de piso para área externa','pisos','recebido','2 hours'),
 ('TESTE-0002','Cliente Teste 02','Quero um vaso sanitário','sanitarios','preparacao','1 day'),
 ('TESTE-0003','Cliente Teste 03','Vou pintar um quarto','pintura','orcamento_enviado','3 days')
) as v(p,n,t,c,st,ago);
insert into public.request_items (request_id, origin, name, quantity)
select id, 'original', original_text, null from public.quote_requests where is_test;