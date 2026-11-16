-- Phase 1 Global Readiness: Multi-EAN support, category mappings, feed delta hashes,
-- atomic offer snapshots with promo/loyalty pricing, price history, and barcode lookup RPC.

-- 1. Multi-EAN / PLU resolution table (N:1 barcodes -> canonical beavy_products)
create table if not exists public.beavy_product_barcodes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.beavy_products(id) on delete cascade,
  barcode text not null,
  barcode_type text not null default 'gtin13'
    check (barcode_type in ('gtin13', 'gtin8', 'gtin12', 'gtin14', 'multipack', 'retailer_plu', 'weigh_scale')),
  retailer_id uuid null references public.beavy_retailers(id) on delete cascade,
  is_primary boolean not null default false,
  source text not null default 'canonical',
  source_url text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists beavy_product_barcodes_product_idx
  on public.beavy_product_barcodes (product_id);

create index if not exists beavy_product_barcodes_barcode_idx
  on public.beavy_product_barcodes (barcode);

create unique index if not exists beavy_product_barcodes_global_uidx
  on public.beavy_product_barcodes (barcode)
  where (retailer_id is null and barcode_type in ('gtin13', 'gtin8', 'gtin12', 'gtin14', 'multipack'));

create unique index if not exists beavy_product_barcodes_retailer_uidx
  on public.beavy_product_barcodes (retailer_id, barcode)
  where (retailer_id is not null);

alter table public.beavy_product_barcodes enable row level security;

drop policy if exists "Public can read barcodes of active Beavy products" on public.beavy_product_barcodes;
create policy "Public can read barcodes of active Beavy products"
  on public.beavy_product_barcodes
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.beavy_products p
      where p.id = beavy_product_barcodes.product_id
        and p.is_active = true
    )
  );

grant select on public.beavy_product_barcodes to anon, authenticated;

insert into public.beavy_product_barcodes (
  product_id,
  barcode,
  barcode_type,
  is_primary,
  source,
  source_url
)
select
  p.id,
  btrim(p.barcode),
  case
    when char_length(btrim(p.barcode)) = 8 then 'gtin8'
    when char_length(btrim(p.barcode)) = 12 then 'gtin12'
    when char_length(btrim(p.barcode)) = 14 then 'gtin14'
    else 'gtin13'
  end,
  true,
  coalesce(p.barcode_source, 'canonical'),
  p.barcode_source_url
from public.beavy_products p
where p.barcode is not null
  and btrim(p.barcode) <> ''
on conflict do nothing;

-- 2. External category mapping table (retailer taxonomy -> canonical beavy_categories)
create table if not exists public.beavy_category_mappings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  retailer_id uuid null references public.beavy_retailers(id) on delete cascade,
  external_category_path text not null,
  normalized_path text not null,
  canonical_category_id uuid not null references public.beavy_categories(id) on delete restrict,
  confidence numeric not null default 1.0 check (confidence >= 0 and confidence <= 1),
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists beavy_category_mappings_source_path_uidx
  on public.beavy_category_mappings (source, normalized_path);

alter table public.beavy_category_mappings enable row level security;

-- 3. Delta tracking & category lineage columns on beavy_source_catalog
alter table public.beavy_source_catalog
  add column if not exists content_hash text null,
  add column if not exists last_seen_run_id uuid null references public.beavy_feed_runs(id) on delete set null,
  add column if not exists last_seen_at timestamptz null,
  add column if not exists external_category_path text null,
  add column if not exists sell_by_mode text not null default 'unit'
    check (sell_by_mode in ('unit', 'kg', 'catch_weight'));

create index if not exists beavy_source_catalog_retailer_active_run_idx
  on public.beavy_source_catalog (retailer_id, is_active, last_seen_run_id);

-- 4. Atomic snapshot constraints, promo/loyalty fields, unit normalization on beavy_product_offers
alter table public.beavy_product_offers
  add column if not exists regular_price numeric null check (regular_price is null or regular_price >= 0),
  add column if not exists promo_price numeric null check (promo_price is null or promo_price >= 0),
  add column if not exists loyalty_price numeric null check (loyalty_price is null or loyalty_price >= 0),
  add column if not exists promo_label text null,
  add column if not exists promo_requires_card boolean not null default false,
  add column if not exists stock_status text not null default 'in_stock'
    check (stock_status in ('in_stock', 'low_stock', 'out_of_stock', 'unknown')),
  add column if not exists sell_by_mode text not null default 'unit'
    check (sell_by_mode in ('unit', 'kg', 'catch_weight')),
  add column if not exists normalized_unit_price numeric null check (normalized_unit_price is null or normalized_unit_price >= 0),
  add column if not exists normalized_unit_label text null,
  add column if not exists last_seen_run_id uuid null references public.beavy_feed_runs(id) on delete set null,
  add column if not exists content_hash text null;

create unique index if not exists beavy_product_offers_active_snapshot_uidx
  on public.beavy_product_offers (
    retailer_id,
    coalesce(fulfillment_node_id, '00000000-0000-0000-0000-000000000000'::uuid),
    product_id,
    fulfillment_channel
  )
  where (is_active is true and product_id is not null and retailer_id is not null);

-- 5. Append-only delta price history (supports Omnibus 30-day lowest price verification & trends)
create table if not exists public.beavy_product_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.beavy_products(id) on delete cascade,
  retailer_id uuid not null references public.beavy_retailers(id) on delete cascade,
  fulfillment_node_id uuid null references public.beavy_fulfillment_nodes(id) on delete set null,
  fulfillment_channel text not null check (fulfillment_channel in ('store', 'delivery', 'online')),
  price numeric not null check (price >= 0),
  regular_price numeric null check (regular_price is null or regular_price >= 0),
  promo_price numeric null check (promo_price is null or promo_price >= 0),
  loyalty_price numeric null check (loyalty_price is null or loyalty_price >= 0),
  currency text not null default 'RON',
  observed_at timestamptz not null,
  run_id uuid null references public.beavy_feed_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists beavy_product_price_history_lookup_idx
  on public.beavy_product_price_history (product_id, retailer_id, observed_at desc);

alter table public.beavy_product_price_history enable row level security;

drop policy if exists "Public can read price history of active Beavy products" on public.beavy_product_price_history;
create policy "Public can read price history of active Beavy products"
  on public.beavy_product_price_history
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.beavy_products p
      where p.id = beavy_product_price_history.product_id
        and p.is_active = true
    )
  );

grant select on public.beavy_product_price_history to anon, authenticated;

-- 6. Fast multi-EAN barcode lookup RPC for ingestion & scanner
create or replace function public.resolve_beavy_product_by_barcode(
  p_barcode text,
  p_retailer_id uuid default null
)
returns table (
  product_id uuid,
  canonical_name text,
  brand text,
  package_size text,
  barcode_type text,
  matched_via text
)
language sql
stable
set search_path = public
as $$
  with cleaned as (
    select nullif(btrim(p_barcode), '') as code
  )
  select
    p.id as product_id,
    p.canonical_name,
    p.brand,
    p.package_size,
    b.barcode_type,
    case
      when b.retailer_id is not null then 'retailer_barcode'
      else 'global_barcode_index'
    end as matched_via
  from cleaned c
  join public.beavy_product_barcodes b
    on b.barcode = c.code
   and (b.retailer_id is null or b.retailer_id = p_retailer_id)
  join public.beavy_products p
    on p.id = b.product_id
   and p.is_active = true
  order by (b.retailer_id is not null) desc, b.is_primary desc
  limit 1;
$$;

grant execute on function public.resolve_beavy_product_by_barcode(text, uuid) to anon, authenticated;
