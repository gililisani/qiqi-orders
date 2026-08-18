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
