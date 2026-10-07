-- Support funds come from Hub orders, not from billing (owner 2026-10-07).
--
-- A client earns support funds while placing a Hub order: the order fixes
-- credit_earned and the SF items the client claims (lib/orderSave.ts).
-- Step 2 of the sales ledger (20261008120000) wrongly switched the REPORT
-- figures (Company Performance, the client dashboard, the executive
-- dashboard) to SF% × billed sales. Sales and goals stay on the ledger;
-- support funds go back to the orders.
--
-- support_fund_events: one row per purchase that earned or redeemed
-- support funds — the single definition every report reads.
--   * Hub orders (source 'order'): earned = orders.credit_earned, used = the
--     SF items claimed, dated when the order was first marked Done — the
--     same definitions as the Support Funds report.
--   * NetSuite invoices / cash sales with no live Hub order (source 'erp'):
--     used = the support funds redeemed on the invoice. Earned is ESTIMATED
--     at the client's SF % of the earning base only for invoices dated before
--     the client's first Hub order (pre-Hub history, as the old manual import
--     did) and on/after the agreement. From the first Hub order on, support
--     funds are earned only through Hub orders.
--   * Credit memos / refunds never touch support funds (the Hub never claws
--     them back).
--   * Invoices linked to a Hub order that isn't Done yet carry nothing — the
--     order counts once it's Done. Invoices linked to a CANCELLED order are
--     treated as NetSuite-only.
--
-- The executive dashboard's views are rebuilt so "Support Fund Used" (and
-- credit_earned) read the same events. Sales columns are unchanged.
--
-- APPLY ORDER: BEFORE the code deploy (the new code reads this view).

create or replace view public.support_fund_events
with (security_invoker = true) as
with first_done as (
  select order_id, min(created_at) as done_at
  from public.order_history
  where status_to = 'Done'
  group by order_id
),
claimed as (
  select order_id, sum(total_price) as used
  from public.order_items
  where is_support_fund_item = true
  group by order_id
),
first_hub_order as (
  select company_id, min((created_at at time zone 'UTC')::date) as since
  from public.orders
  where status not in ('Draft', 'Cancelled') and company_id is not null
  group by company_id
)
select
  o.company_id,
  (fd.done_at at time zone 'UTC')::date          as day,
  'order'::text                                   as source,
  o.id                                            as order_id,
  null::uuid                                      as document_id,
  coalesce(o.credit_earned, 0)::numeric           as earned,
  coalesce(cl.used, 0)::numeric                   as used
from public.orders o
join first_done fd on fd.order_id = o.id
left join claimed cl on cl.order_id = o.id
where o.status = 'Done' and o.company_id is not null
union all
select
  d.company_id,
  d.doc_date                                      as day,
  'erp'::text                                     as source,
  null::uuid                                      as order_id,
  d.id                                            as document_id,
  case
    when (fh.since is null or d.doc_date < fh.since)
     and (c.contract_execution_date is null or d.doc_date >= c.contract_execution_date)
      then round(d.credit_base_amount * coalesce(sl.percent, 0) / 100, 2)
    else 0
  end::numeric                                    as earned,
  coalesce(d.support_fund, 0)::numeric            as used
from public.sales_documents d
join public.companies c on c.id = d.company_id
left join public.support_fund_levels sl on sl.id = c.support_fund_id
left join first_hub_order fh on fh.company_id = d.company_id
left join public.orders lo on lo.id = d.order_id
where d.doc_type in ('invoice', 'cash_sale')
  and (d.order_id is null or lo.status = 'Cancelled');

comment on view public.support_fund_events is
  'Support funds per purchase: Hub orders (credit_earned + SF items, dated first Done) and NetSuite-only invoices (redeemed; earned estimated at SF% only before the client''s first Hub order and on/after the agreement). Single definition for every report.';

revoke all on public.support_fund_events from public, anon, authenticated;
grant select on public.support_fund_events to service_role;

------------------------------------------------------------------------
-- mv_daily_sales — sales from the ledger (unchanged), support funds from
-- the events.
------------------------------------------------------------------------

drop materialized view if exists public.mv_daily_sales cascade;

create materialized view public.mv_daily_sales as
with docs as (
  select
    doc_date                                                              as day,
    count(*) filter (where doc_type in ('invoice', 'cash_sale'))          as orders,
    sum(sales_amount)                                                     as revenue,
    sum(sales_amount) filter (where doc_type in ('invoice', 'cash_sale')) as invoice_revenue
  from public.sales_documents
  group by doc_date
),
sf as (
  select day, sum(used) as used, sum(earned) as earned
  from public.support_fund_events
  group by day
)
select
  coalesce(docs.day, sf.day)                  as day,
  'ledger'::text                              as source,
  coalesce(docs.orders, 0)::int               as orders,
  coalesce(docs.revenue, 0)::numeric          as revenue,
  coalesce(docs.invoice_revenue, 0)::numeric  as invoice_revenue,
  coalesce(sf.used, 0)::numeric               as support_fund_used,
  coalesce(sf.earned, 0)::numeric             as credit_earned
from docs
full outer join sf on sf.day = docs.day;

create unique index mv_daily_sales_pk_idx on public.mv_daily_sales (day, source);
create index mv_daily_sales_day_idx on public.mv_daily_sales (day);

------------------------------------------------------------------------
-- mv_company_sales (30d / 90d / YTD per company) — same split.
------------------------------------------------------------------------

drop materialized view if exists public.mv_company_sales cascade;

create materialized view public.mv_company_sales as
with windows as (
  select '30d'::text as window_key, (now() - interval '30 days') as since union all
  select '90d'::text,                 (now() - interval '90 days') union all
  select 'ytd'::text,                 date_trunc('year', now())
),
docs as (
  select
    d.company_id,
    w.window_key,
    count(*) filter (where d.doc_type in ('invoice', 'cash_sale')) as orders,
    sum(d.sales_amount)                                            as revenue,
    max(d.doc_date::timestamptz)                                   as last_activity_at
  from public.sales_documents d
  cross join windows w
  where d.doc_date >= (w.since)::date
  group by d.company_id, w.window_key
),
sf as (
  select e.company_id, w.window_key, sum(e.used) as used
  from public.support_fund_events e
  cross join windows w
  where e.day >= (w.since)::date
  group by e.company_id, w.window_key
)
select
  coalesce(docs.company_id, sf.company_id)    as company_id,
  coalesce(docs.window_key, sf.window_key)    as window_key,
  'ledger'::text                              as source,
  coalesce(docs.orders, 0)::int               as orders,
  coalesce(docs.revenue, 0)::numeric          as revenue,
  coalesce(sf.used, 0)::numeric               as support_fund_used,
  docs.last_activity_at
from docs
full outer join sf on sf.company_id = docs.company_id and sf.window_key = docs.window_key;

create unique index mv_company_sales_pk_idx on public.mv_company_sales (company_id, window_key, source);
create index mv_company_sales_window_revenue_idx on public.mv_company_sales (window_key, revenue desc);

------------------------------------------------------------------------
-- Permissions (recreated MVs lose grants). mv_product_sales is untouched.
------------------------------------------------------------------------

grant select on public.mv_daily_sales   to service_role;
grant select on public.mv_company_sales to service_role;

revoke all on public.mv_daily_sales   from anon, authenticated;
revoke all on public.mv_company_sales from anon, authenticated;
