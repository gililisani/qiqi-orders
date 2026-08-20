-- ============================================================
-- Shopify sync — PRODUCTION Supabase apply (2026-08-20)
-- All 5 migrations combined, in order. Paste this whole file
-- into the prod Supabase SQL editor and Run once.
-- Idempotence: these CREATE TABLEs will error if re-run — that
-- means it already ran; do not run twice.
-- Result: tables only, mode='off' — nothing starts syncing.
-- ============================================================

-- ---- 20260817220000_shopify_sync_state.sql ----
-- Shopify → NetSuite sync state (docs/SHOPIFY-SYNC.md, Phase 2).
--
-- Server-only tables: every reader/writer is a service-role route or the
-- sync engine. RLS is enabled with admin-read policies so the admin UI can
-- query directly if it ever wants to; clients get nothing.

-- 1. Config: single-row table (mode, cursors, gates).
create table public.shopify_sync_config (
  id int primary key default 1 check (id = 1),
  mode text not null default 'off'
    check (mode in ('off', 'shadow', 'sandbox', 'live')),
  orders_cursor timestamptz,           -- loop A: updated_at high-water mark
  fulfillments_cursor timestamptz,     -- loop B
  payouts_cursor date,                 -- loop E
  last_poll_at timestamptz,
  last_poll_error text,
  updated_at timestamptz not null default now()
);

insert into public.shopify_sync_config (id, mode) values (1, 'off');

-- 2. Per-order sync state. One row per Shopify order, forever.
create table public.shopify_order_sync (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text not null unique,       -- numeric id, e.g. '7530826367031'
  order_name text not null,                    -- '#7246'
  order_created_at timestamptz not null,
  shopify_updated_at timestamptz,              -- for change detection
  buyer_kind text check (buyer_kind in ('b2b', 'b2c')),
  shopify_customer_id text,
  shopify_company_id text,

  state text not null default 'pending' check (state in (
    'pending',        -- seen, not yet processed
    'skipped',        -- gate said skip (test order / unpaid / zero)
    'so_created',
    'invoiced',
    'paid',
    'fulfilled',
    'closed',
    'refunded',
    'cancelled',
    'error'
  )),
  skip_reason text,

  -- NS record ids (per mode; sandbox runs are wiped on sandbox refresh,
  -- so we also record which target they belong to)
  ns_target text check (ns_target in ('sandbox', 'production')),
  ns_customer_id text,
  ns_so_id text,
  ns_invoice_id text,
  ns_payment_ids text[] default '{}',          -- split tender ⇒ several
  ns_fulfillment_ids text[] default '{}',
  ns_credit_memo_ids text[] default '{}',

  -- money snapshot (cents) for recon + dashboards
  total_cents int,
  tax_cents int,
  shipping_cents int,
  refunded_cents int default 0,

  error_code text,
  error_message text,
  error_detail jsonb,
  retry_count int not null default 0,

  plan jsonb,                                  -- last computed OrderPlan
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopify_order_sync_state_idx on public.shopify_order_sync (state);
create index shopify_order_sync_created_idx on public.shopify_order_sync (order_created_at desc);

-- 3. Append-only event log (what happened to each order, when, by which loop).
create table public.shopify_sync_events (
  id bigint generated always as identity primary key,
  shopify_order_id text,                       -- null for loop-level events
  loop text not null check (loop in ('orders', 'fulfillments', 'refunds', 'reconcile', 'payouts', 'system')),
  event text not null,                         -- 'so_ensured', 'gate_error', ...
  detail jsonb,
  created_at timestamptz not null default now()
);

create index shopify_sync_events_order_idx on public.shopify_sync_events (shopify_order_id, created_at desc);
create index shopify_sync_events_created_idx on public.shopify_sync_events (created_at desc);

-- RLS: enabled everywhere; admins may read (dashboards); nobody else gets
-- anything. All writes come from service-role (bypasses RLS).
alter table public.shopify_sync_config enable row level security;
alter table public.shopify_order_sync enable row level security;
alter table public.shopify_sync_events enable row level security;

create policy shopify_sync_config_admin_read on public.shopify_sync_config
  for select to authenticated using (auth_is_admin());
create policy shopify_order_sync_admin_read on public.shopify_order_sync
  for select to authenticated using (auth_is_admin());
create policy shopify_sync_events_admin_read on public.shopify_sync_events
  for select to authenticated using (auth_is_admin());

-- ---- 20260819100000_shopify_payout_sync.sql ----
-- Loop E state: one row per Shopify Payments payout (docs/SHOPIFY-SYNC.md).

create table public.shopify_payout_sync (
  id uuid primary key default gen_random_uuid(),
  shopify_payout_id text not null unique,
  issued_at date not null,
  status text not null,
  net_cents int not null,
  fee_cents int not null default 0,
  state text not null default 'pending' check (state in ('pending', 'booked', 'error')),
  ns_target text check (ns_target in ('sandbox', 'production')),
  ns_fee_bill_id text,
  ns_fee_payment_id text,
  ns_journal_id text,
  composition jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopify_payout_sync_issued_idx on public.shopify_payout_sync (issued_at desc);

alter table public.shopify_payout_sync enable row level security;
create policy shopify_payout_sync_admin_read on public.shopify_payout_sync
  for select to authenticated using (auth_is_admin());

-- ---- 20260820100000_shopify_error_tools.sql ----
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

-- ---- 20260820120000_netscore_snapshot.sql ----
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

-- ---- 20260820130000_netscore_snapshot_pk.sql ----
-- Sandbox is a copy of prod: internal ids collide across targets. Key by
-- (ns_target, id) so snapshots of both environments coexist.
alter table public.netscore_customer_stamps drop constraint netscore_customer_stamps_pkey;
alter table public.netscore_customer_stamps add primary key (ns_target, ns_customer_id);
alter table public.netscore_transaction_stamps drop constraint netscore_transaction_stamps_pkey;
alter table public.netscore_transaction_stamps add primary key (ns_target, ns_transaction_id);
alter table public.netscore_item_stamps drop constraint netscore_item_stamps_pkey;
alter table public.netscore_item_stamps add primary key (ns_target, ns_item_id);
