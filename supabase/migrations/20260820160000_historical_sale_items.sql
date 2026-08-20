-- Product line items for historical sales (NetSuite import, reporting).
--
-- Owner decision 2026-08-20: historical reporting needs product-level data,
-- so the NS import also captures each invoice's lines. Lines are matched to
-- the Hub catalog by SKU; unmatched lines (old kits, discontinued items)
-- keep their SKU/name with product_id NULL so revenue totals stay honest.
-- Amounts are signed: negative-amount lines are NS free-goods/discount
-- product lines, preserved as-is so per-invoice item sums reconcile.
--
-- Admin-only (like historical_sales): reports read via service role, the
-- admin page reads browser-direct.

create table if not exists public.historical_sale_items (
  id uuid primary key default extensions.uuid_generate_v4(),
  historical_sale_id uuid not null references public.historical_sales(id) on delete cascade,
  product_id integer references public."Products"(id) on delete set null,
  sku text,
  item_name text,
  quantity numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_historical_sale_items_sale
  on public.historical_sale_items (historical_sale_id);

alter table public.historical_sale_items enable row level security;

create policy historical_sale_items_admin_all
  on public.historical_sale_items
  for all
  using (auth_is_admin())
  with check (auth_is_admin());
