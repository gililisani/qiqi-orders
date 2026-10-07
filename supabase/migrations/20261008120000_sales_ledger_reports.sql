-- Sales ledger, step 2 — reports read what the ERP billed.
--
-- Company Performance, target progress and the client's goal view now read
-- sales_documents (code, lib/companyPerformance.ts). This migration moves
-- the executive dashboard's pre-rolled views onto the same ledger and adds
-- the support-funds earning base the reports need.
--
-- 1. sales_documents.credit_base_amount — the part of a document's sales
--    that EARNS support funds (kits and goods paid with support funds don't;
--    computed by the sync, lib/salesLedger/classify.ts). 0 until the next
--    sync fills it.
-- 2. mv_daily_sales / mv_company_sales / mv_product_sales rebuilt from the
--    ledger: revenue by DOCUMENT date (invoices, minus credit memos),
--    "orders" = invoices + cash sales, support funds redeemed per document,
--    earned = SF% × earning base on/after the client's agreement. Same
--    names and unique indexes, so refresh_executive_reports() (CONCURRENTLY)
--    keeps working unchanged. The order-status funnel stays live on orders.
--
-- historical_sales / historical_sale_items are no longer read by any
-- report; their rows are removed separately (owner, after a backup).
--
-- APPLY ORDER: BEFORE the code deploy (the new sync writes
-- credit_base_amount). For the minutes between this and the deploy the
-- current dashboard shows ledger revenue with "Avg order value" at $0.

alter table public.sales_documents
  add column if not exists credit_base_amount numeric(14,2) not null default 0;

comment on column public.sales_documents.credit_base_amount is
  'USD: the part of sales_amount that earns support funds (catalog qualifies_for_credit_earning; non-catalog items follow their SKU family). Earned = support-fund % × this, on/after the agreement.';

------------------------------------------------------------------------
-- mv_daily_sales
------------------------------------------------------------------------

drop materialized view if exists public.mv_daily_sales cascade;

create materialized view public.mv_daily_sales as
select
  d.doc_date                                                       as day,
  'ledger'::text                                                   as source,
  count(*) filter (where d.doc_type in ('invoice', 'cash_sale'))::int as orders,
  coalesce(sum(d.sales_amount), 0)::numeric                        as revenue,
  coalesce(sum(d.sales_amount) filter (where d.doc_type in ('invoice', 'cash_sale')), 0)::numeric
                                                                   as invoice_revenue,
  coalesce(sum(d.support_fund), 0)::numeric                        as support_fund_used,
  coalesce(sum(
    case
      when c.contract_execution_date is null or d.doc_date >= c.contract_execution_date
        then d.credit_base_amount * coalesce(sl.percent, 0) / 100
      else 0
    end
  ), 0)::numeric                                                   as credit_earned
from public.sales_documents d
join public.companies c on c.id = d.company_id
left join public.support_fund_levels sl on sl.id = c.support_fund_id
group by d.doc_date;

create unique index mv_daily_sales_pk_idx on public.mv_daily_sales (day, source);
create index mv_daily_sales_day_idx on public.mv_daily_sales (day);

------------------------------------------------------------------------
-- mv_company_sales (30d / 90d / YTD per company)
------------------------------------------------------------------------

drop materialized view if exists public.mv_company_sales cascade;

create materialized view public.mv_company_sales as
with windows as (
  select '30d'::text as window_key, (now() - interval '30 days') as since union all
  select '90d'::text,                 (now() - interval '90 days') union all
  select 'ytd'::text,                 date_trunc('year', now())
)
select
  d.company_id,
  w.window_key,
  'ledger'::text                                                      as source,
  count(*) filter (where d.doc_type in ('invoice', 'cash_sale'))::int as orders,
  coalesce(sum(d.sales_amount), 0)::numeric                           as revenue,
  coalesce(sum(d.support_fund), 0)::numeric                           as support_fund_used,
  max(d.doc_date::timestamptz)                                        as last_activity_at
from public.sales_documents d
cross join windows w
where d.doc_date >= (w.since)::date
group by d.company_id, w.window_key;

create unique index mv_company_sales_pk_idx on public.mv_company_sales (company_id, window_key, source);
create index mv_company_sales_window_revenue_idx on public.mv_company_sales (window_key, revenue desc);

------------------------------------------------------------------------
-- mv_product_sales (30d / 90d / YTD per catalog product)
------------------------------------------------------------------------

drop materialized view if exists public.mv_product_sales cascade;

create materialized view public.mv_product_sales as
with windows as (
  select '30d'::text as window_key, (now() - interval '30 days') as since union all
  select '90d'::text,                 (now() - interval '90 days') union all
  select 'ytd'::text,                 date_trunc('year', now())
)
select
  l.product_id,
  w.window_key,
  coalesce(sum(l.quantity), 0)::numeric      as units,
  coalesce(sum(l.amount), 0)::numeric        as revenue,
  count(distinct l.document_id)::int         as orders
from public.sales_document_lines l
join public.sales_documents d on d.id = l.document_id
cross join windows w
where l.kind = 'product'
  and l.product_id is not null
  and d.doc_date >= (w.since)::date
group by l.product_id, w.window_key;

create unique index mv_product_sales_pk_idx on public.mv_product_sales (product_id, window_key);
create index mv_product_sales_window_revenue_idx on public.mv_product_sales (window_key, revenue desc);

------------------------------------------------------------------------
-- Permissions (recreated MVs lose grants). Queried only by the
-- admin-guarded API route via service_role.
------------------------------------------------------------------------

grant select on public.mv_daily_sales   to service_role;
grant select on public.mv_company_sales to service_role;
grant select on public.mv_product_sales to service_role;

revoke all on public.mv_daily_sales   from anon, authenticated;
revoke all on public.mv_company_sales from anon, authenticated;
revoke all on public.mv_product_sales from anon, authenticated;
