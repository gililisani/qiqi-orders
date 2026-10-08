-- B2 — what counts as a client's sales (owner 2026-10-08: Hub first).
--
-- sales_entries is the ONE definition every report reads (Company
-- Performance, the client's goals and dashboard, target progress, the
-- executive dashboard). Two sources only — no hand-typed history:
--
--  1. Hub orders, exactly as the Hub recorded them (total_value; support
--     funds = credit_earned and the SF items claimed). An order counts once
--     it is Done or paid in full, on whichever came first: the day it was
--     first marked Done, or paid_at.
--  2. NetSuite documents an admin approved on the NetSuite review page
--     (sales_document_reviews):
--       - billed externally (outside_sale): its products, on the invoice date;
--         support funds = the invoice's discount, earned = used (the original
--         order amount is unknowable for these);
--       - credits (never support funds): attached to a Hub order → reduce it,
--         on that order's day (only once the order counts); attached to an
--         invoice billed externally → reduce it, on that invoice's day;
--         recorded for the company → on the credit's own date.
--     Invoices attached to a Hub order and ignored documents add nothing.
--
-- historical_sales is no longer read by anything; its rows are removed in
-- the same owner-run cutover (backup in backups/).
--
-- Also: orders that are paid in full but not Done and have no paid date
-- (wires settled in NetSuite before the Hub recorded payment dates — two
-- orders at cutover) get their NetSuite invoice date as paid_at; from now on
-- the invoice refresh records the day it sees an invoice paid.
--
-- APPLY ORDER: together with the code deploy (cutover) — the dashboard views
-- below stop reading historical_sales.

-- ---- paid_at for paid-in-full orders that never got one (not Done only) ----
update public.orders
set paid_at = netsuite_invoice_date::timestamptz
where paid_at is null
  and netsuite_invoice_date is not null
  and status not in ('Done', 'Draft', 'Cancelled')
  and (
    payment_status = 'paid'
    or netsuite_invoice_status ilike '%paid in full%'
    or (netsuite_invoice_id is not null and invoice_amount_remaining = 0)
  );

-- ---- The definition ----
create or replace view public.sales_entries
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
counted_orders as (
  select
    o.id,
    o.company_id,
    o.total_value,
    o.credit_earned,
    (least(
      case when o.status = 'Done' then fd.done_at end,
      case
        when o.payment_status = 'paid'
          or o.netsuite_invoice_status ilike '%paid in full%'
          or (o.netsuite_invoice_id is not null and o.invoice_amount_remaining = 0)
        then o.paid_at
      end
    ) at time zone 'UTC')::date as day
  from public.orders o
  left join first_done fd on fd.order_id = o.id
  where o.company_id is not null
    and o.status not in ('Draft', 'Cancelled')
),
approved as (
  select r.decision, r.order_id, r.attached_document_id,
         d.id, d.company_id, d.doc_type, d.doc_date, d.sales_amount, d.support_fund
  from public.sales_document_reviews r
  join public.sales_documents d on d.id = r.document_id
)
-- 1. Hub orders that count
select
  co.company_id,
  co.day,
  'hub_order'::text                         as source,
  co.id                                     as order_id,
  null::uuid                                as document_id,
  coalesce(co.total_value, 0)::numeric      as amount,
  coalesce(co.credit_earned, 0)::numeric    as sf_earned,
  coalesce(cl.used, 0)::numeric             as sf_used
from counted_orders co
left join claimed cl on cl.order_id = co.id
where co.day is not null
union all
-- 2a. Invoices billed externally (approved)
select a.company_id, a.doc_date, 'billed_externally', null, a.id,
       a.sales_amount, a.support_fund, a.support_fund
from approved a
where a.decision = 'outside_sale'
union all
-- 2b. Credits attached to a Hub order — on the order's day, once it counts
select a.company_id, co.day, 'credit', co.id, a.id, a.sales_amount, 0, 0
from approved a
join counted_orders co on co.id = a.order_id
where a.decision = 'attach'
  and a.doc_type in ('credit_memo', 'cash_refund')
  and co.day is not null
union all
-- 2c. Credits attached to an invoice billed externally — on that invoice's day
select a.company_id, t.doc_date, 'credit', null, a.id, a.sales_amount, 0, 0
from approved a
join public.sales_documents t on t.id = a.attached_document_id
join public.sales_document_reviews tr on tr.document_id = t.id and tr.decision = 'outside_sale'
where a.decision = 'attach'
  and a.doc_type in ('credit_memo', 'cash_refund')
union all
-- 2d. Credits recorded for the company — on the credit's own date
select a.company_id, a.doc_date, 'credit', null, a.id, a.sales_amount, 0, 0
from approved a
where a.decision = 'company_credit';

comment on view public.sales_entries is
  'What counts as a client''s sales (Hub first): Hub orders once Done or paid in full (earlier of first Done / paid_at), plus NetSuite documents approved on the NetSuite review page — invoices billed externally (SF earned = used = the discount) and credits (attached to their order''s day, or the credit date when recorded for the company; never support funds). The single definition every report reads.';

revoke all on public.sales_entries from public, anon, authenticated;
grant select on public.sales_entries to service_role;

------------------------------------------------------------------------
-- Executive dashboard views: Hub orders (unchanged — by creation date,
-- committed orders) + approved NetSuite entries instead of historical_sales.
------------------------------------------------------------------------

drop materialized view if exists public.mv_daily_sales cascade;

create materialized view public.mv_daily_sales as
with from_orders as (
  select
    (created_at at time zone 'UTC')::date           as day,
    'orders'::text                                   as source,
    count(*)::int                                    as orders,
    coalesce(sum(total_value), 0)::numeric           as revenue,
    coalesce(sum(support_fund_used), 0)::numeric     as support_fund_used,
    coalesce(sum(credit_earned), 0)::numeric         as credit_earned
  from public.orders
  where status not in ('Draft', 'Cancelled')
  group by 1
),
from_netsuite as (
  select
    day,
    'netsuite'::text                                                  as source,
    count(*) filter (where source = 'billed_externally')::int         as orders,
    coalesce(sum(amount), 0)::numeric                                 as revenue,
    coalesce(sum(sf_used), 0)::numeric                                as support_fund_used,
    coalesce(sum(sf_earned), 0)::numeric                              as credit_earned
  from public.sales_entries
  where source in ('billed_externally', 'credit')
  group by day
)
select * from from_orders
union all
select * from from_netsuite;

create unique index mv_daily_sales_pk_idx on public.mv_daily_sales (day, source);
create index mv_daily_sales_day_idx on public.mv_daily_sales (day);

drop materialized view if exists public.mv_company_sales cascade;

create materialized view public.mv_company_sales as
with windows as (
  select '30d'::text as window_key, (now() - interval '30 days') as since union all
  select '90d'::text,                 (now() - interval '90 days') union all
  select 'ytd'::text,                 date_trunc('year', now())
),
from_orders as (
  select
    o.company_id,
    w.window_key,
    'orders'::text                                  as source,
    count(*)::int                                   as orders,
    coalesce(sum(o.total_value), 0)::numeric        as revenue,
    coalesce(sum(o.support_fund_used), 0)::numeric  as support_fund_used,
    max(o.created_at)                               as last_activity_at
  from public.orders o
  cross join windows w
  where o.status not in ('Draft', 'Cancelled')
    and o.created_at >= w.since
    and o.company_id is not null
  group by o.company_id, w.window_key
),
from_netsuite as (
  select
    e.company_id,
    w.window_key,
    'netsuite'::text                                                    as source,
    count(*) filter (where e.source = 'billed_externally')::int         as orders,
    coalesce(sum(e.amount), 0)::numeric                                 as revenue,
    coalesce(sum(e.sf_used), 0)::numeric                                as support_fund_used,
    max(e.day::timestamptz)                                             as last_activity_at
  from public.sales_entries e
  cross join windows w
  where e.source in ('billed_externally', 'credit')
    and e.day >= (w.since)::date
  group by e.company_id, w.window_key
)
select * from from_orders
union all
select * from from_netsuite;

create unique index mv_company_sales_pk_idx on public.mv_company_sales (company_id, window_key, source);
create index mv_company_sales_window_revenue_idx on public.mv_company_sales (window_key, revenue desc);

grant select on public.mv_daily_sales   to service_role;
grant select on public.mv_company_sales to service_role;
revoke all on public.mv_daily_sales   from anon, authenticated;
revoke all on public.mv_company_sales from anon, authenticated;
