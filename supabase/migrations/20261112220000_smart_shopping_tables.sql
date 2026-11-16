-- Migration: Smart Shopping persistence tables for Beavy optimization results and product assignments

create table if not exists public.smart_basket_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete cascade,
  shopping_list_id text null,
  optimization_mode text not null default 'balanced',
  recommended_scenario text not null default 'smart_basket',
  total_product_cost numeric not null,
  store_count integer not null default 1,
  inconvenience_penalty numeric not null default 0,
  travel_cost numeric not null default 0,
  delivery_cost numeric not null default 0,
  objective_score numeric not null,
  total_to_pay numeric not null,
  total_savings numeric not null default 0,
  config jsonb not null default '{}'::jsonb,
  scenarios_payload jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists smart_basket_results_user_idx
  on public.smart_basket_results (user_id);

create index if not exists smart_basket_results_list_idx
  on public.smart_basket_results (shopping_list_id);

create table if not exists public.smart_basket_assignments (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.smart_basket_results(id) on delete cascade,
  scenario_id text not null default 'smart_basket',
  item_id text not null,
  canonical_product_id uuid null references public.beavy_products(id) on delete set null,
  retailer_id uuid null references public.beavy_retailers(id) on delete set null,
  retailer_name text not null,
  offer_id uuid null references public.beavy_product_offers(id) on delete set null,
  quantity numeric not null default 1,
  unit_price numeric not null,
  line_total numeric not null,
  match_quality text not null default 'exact_id',
  is_substitution boolean not null default false,
  substitution_reason text null,
  created_at timestamptz not null default now()
);

create index if not exists smart_basket_assignments_result_idx
  on public.smart_basket_assignments (result_id, scenario_id);

-- Enable RLS
alter table public.smart_basket_results enable row level security;
alter table public.smart_basket_assignments enable row level security;

-- Strict RLS policies: only authenticated owners can read or insert their own persisted results
drop policy if exists "Users and guests can read their smart basket results" on public.smart_basket_results;
create policy "Users and guests can read their smart basket results"
  on public.smart_basket_results
  for select
  to authenticated
  using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Users and guests can create smart basket results" on public.smart_basket_results;
create policy "Users and guests can create smart basket results"
  on public.smart_basket_results
  for insert
  to authenticated
  with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Users and guests can read smart basket assignments" on public.smart_basket_assignments;
create policy "Users and guests can read smart basket assignments"
  on public.smart_basket_assignments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.smart_basket_results r
      where r.id = smart_basket_assignments.result_id
        and auth.uid() is not null
        and r.user_id = auth.uid()
    )
  );

drop policy if exists "Users and guests can create smart basket assignments" on public.smart_basket_assignments;
create policy "Users and guests can create smart basket assignments"
  on public.smart_basket_assignments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.smart_basket_results r
      where r.id = smart_basket_assignments.result_id
        and auth.uid() is not null
        and r.user_id = auth.uid()
    )
  );

grant select, insert on public.smart_basket_results to authenticated;
grant select, insert on public.smart_basket_assignments to authenticated;
