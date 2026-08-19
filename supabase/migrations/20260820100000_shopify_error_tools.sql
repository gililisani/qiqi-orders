-- Self-service error tooling (docs/SHOPIFY-SYNC.md, owner requirement #3).

-- 'ignored' = explicit human decision to not sync an order; auditable,
-- excluded from the error counter, never deleted.
alter table public.shopify_order_sync drop constraint shopify_order_sync_state_check;
alter table public.shopify_order_sync add constraint shopify_order_sync_state_check check (state in (
  'pending', 'skipped', 'so_created', 'invoiced', 'paid', 'fulfilled',
  'closed', 'refunded', 'cancelled', 'error', 'ignored'
));
alter table public.shopify_order_sync add column ignore_note text;

-- Permanent SKU aliases: a Shopify SKU mapped once to an NS item.
create table public.shopify_sku_aliases (
  shopify_sku text primary key,
  ns_item_id text not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.shopify_sku_aliases enable row level security;
create policy shopify_sku_aliases_admin_read on public.shopify_sku_aliases
  for select to authenticated using (auth_is_admin());

-- Daily digest bookkeeping.
alter table public.shopify_sync_config add column last_digest_at timestamptz;
