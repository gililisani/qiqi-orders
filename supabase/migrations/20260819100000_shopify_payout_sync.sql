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
