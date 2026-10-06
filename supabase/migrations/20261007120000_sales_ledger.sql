-- Sales ledger — the Hub's record of what was actually SOLD, mirrored from
-- the ERP's billing documents (NetSuite invoices, credit memos, cash sales).
--
-- Why (owner, 2026-10-06): Hub orders are only one way sales happen. Sales
-- made before a client adopted the Hub, orders entered straight in NetSuite
-- (price exceptions), backorders billed later, credit memos / returns and
-- 3PL over-shipments invoiced in NetSuite never pass through a Hub order, so
-- "Done orders + hand-typed history" drifted from reality. The ledger is
-- read-only from NetSuite and links each document to its Hub order (via the
-- sales order) when there is one.
--
-- Step 1 (this migration): ledger + nightly sync + Settings → Sales rule +
-- per-company reconciliation page. Reports are NOT switched yet.
--
-- Amounts are stored in the company's reporting currency (USD): foreign
-- currency documents are converted with the exchange rate NetSuite recorded
-- on the document. sales_amount follows the tenant's sales rule (Settings →
-- Sales): document total minus every line that is not a product or a
-- discount (shipping, fees, card surcharges, services, other charges).
--
-- No tenant data is seeded: the sync stays off until Settings → Sales has a
-- history start date.
--
-- Module tables keyed by a single column (see 20261006120000): no second FK
-- path between tables that already reference each other.
--
-- APPLY ORDER: BEFORE the code deploy (the new code reads these tables).
-- Safe for the code already deployed (it never touches them).

-- ---- Settings (singleton) ----
create table if not exists public.sales_settings (
  id integer primary key default 1 check (id = 1),
  history_start_date date,
  product_sku_prefixes text[] not null default '{}',
  discount_item_names text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.sales_settings is
  'Singleton: what counts as sales (Settings → Sales). Hub catalog products always count; product_sku_prefixes adds ERP items outside the catalog (e.g. discontinued versions); discount_item_names marks non-discount-type items that reduce sales. Everything else on a document is excluded.';

insert into public.sales_settings (id) values (1) on conflict (id) do nothing;

-- ---- Documents ----
create table if not exists public.sales_documents (
  id uuid primary key default gen_random_uuid(),
  netsuite_id text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_type text not null check (doc_type in ('invoice', 'credit_memo', 'cash_sale', 'cash_refund')),
  tranid text not null,
  doc_date date not null,
  currency text not null default 'USD',
  exchange_rate numeric(18,8) not null default 1,
  total_foreign numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  sales_amount numeric(14,2) not null default 0,
  excluded_amount numeric(14,2) not null default 0,
  support_fund numeric(14,2) not null default 0,
  netsuite_so_id text,
  so_tranid text,
  order_id uuid references public.orders(id) on delete set null,
  po_ref text,
  memo text,
  ns_status text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.sales_documents is
  'ERP billing documents (read-only mirror). Amounts in USD. sales_amount = total minus excluded lines (Settings → Sales). support_fund = SF redeemed on the document (every line that reduces it). order_id = the Hub order whose sales order billed it; null = sold outside the Hub.';

create index if not exists idx_sales_documents_company_date on public.sales_documents (company_id, doc_date);
create index if not exists idx_sales_documents_order on public.sales_documents (order_id) where order_id is not null;

-- ---- Lines ----
create table if not exists public.sales_document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.sales_documents(id) on delete cascade,
  line_no integer not null default 0,
  kind text not null check (kind in ('product', 'discount', 'excluded')),
  product_id integer references public."Products"(id) on delete set null,
  sku text,
  item_name text,
  item_type text,
  quantity numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0
);

comment on table public.sales_document_lines is
  'Lines of a sales document. kind: product (counts as sales, feeds product mix; quantity/amount negative on credit memos), discount (SF / reductions), excluded (shipping, fees, services…). amount in USD, signed as its effect on the document total.';

create index if not exists idx_sales_document_lines_doc on public.sales_document_lines (document_id);

-- ---- Sync status per company ----
create table if not exists public.sales_company_sync (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_synced_at timestamptz,
  last_error text,
  document_count integer not null default 0
);

comment on table public.sales_company_sync is
  'Per-company sales-ledger sync status (nightly cron + Sync now).';

-- ---- RLS: admin-only (server code uses the service role) ----
alter table public.sales_settings enable row level security;
alter table public.sales_documents enable row level security;
alter table public.sales_document_lines enable row level security;
alter table public.sales_company_sync enable row level security;

drop policy if exists sales_settings_admin_all on public.sales_settings;
create policy sales_settings_admin_all on public.sales_settings
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists sales_documents_admin_all on public.sales_documents;
create policy sales_documents_admin_all on public.sales_documents
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists sales_document_lines_admin_all on public.sales_document_lines;
create policy sales_document_lines_admin_all on public.sales_document_lines
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists sales_company_sync_admin_all on public.sales_company_sync;
create policy sales_company_sync_admin_all on public.sales_company_sync
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());
