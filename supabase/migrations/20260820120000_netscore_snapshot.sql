-- Permanent snapshot of NetScore's custom-field data, taken BEFORE their
-- bundle is uninstalled (uninstall deletes fields + data). This is the
-- durable home; the customer-matching ladder reads it once the fields die.

create table public.netscore_customer_stamps (
  ns_customer_id text primary key,
  shopify_customer_id text not null,
  entity_id text,
  company_name text,
  email text,
  is_inactive boolean default false,
  ns_target text not null default 'production',
  snapshotted_at timestamptz not null default now()
);
create index netscore_customer_stamps_shop_idx on public.netscore_customer_stamps (shopify_customer_id);

create table public.netscore_transaction_stamps (
  ns_transaction_id text primary key,
  shopify_order_id text not null,
  tran_type text,
  tran_id text,
  ns_target text not null default 'production',
  snapshotted_at timestamptz not null default now()
);
create index netscore_transaction_stamps_shop_idx on public.netscore_transaction_stamps (shopify_order_id);

create table public.netscore_item_stamps (
  ns_item_id text primary key,
  item_code text,
  shopify_product_id text,
  shopify_variant_id text,
  ns_target text not null default 'production',
  snapshotted_at timestamptz not null default now()
);

alter table public.netscore_customer_stamps enable row level security;
alter table public.netscore_transaction_stamps enable row level security;
alter table public.netscore_item_stamps enable row level security;
create policy netscore_customer_stamps_admin_read on public.netscore_customer_stamps for select to authenticated using (auth_is_admin());
create policy netscore_transaction_stamps_admin_read on public.netscore_transaction_stamps for select to authenticated using (auth_is_admin());
create policy netscore_item_stamps_admin_read on public.netscore_item_stamps for select to authenticated using (auth_is_admin());
