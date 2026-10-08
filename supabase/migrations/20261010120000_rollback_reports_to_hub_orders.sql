-- Roll the reports back to Hub orders (owner 2026-10-08: Hub first).
--
-- Steps 2 and 3 of the sales ledger (20261008120000, 20261009120000) made
-- NetSuite billing the source of sales and support funds. The owner rejected
-- that: a Hub order counts as the Hub recorded it, and anything from NetSuite
-- counts only after an admin approves it (a review page, built separately).
--
-- This restores the executive dashboard's views exactly as they were before
-- the ledger (Hub orders + historical_sales, 20260524150000; product mix
-- without support-fund lines, 20260802160000) and drops the support-fund
-- view nothing reads any more. The ledger tables stay: the NetSuite sync
-- keeps mirroring for the company Sales (NetSuite) page, but no report reads
-- them. sales_documents.credit_base_amount stays (unused, harmless).
--
-- historical_sales rows are restored from the 2026-10-07 backup by a
-- separate owner-run file (production data never goes in the repo).

drop view if exists public.support_fund_events cascade; -- also drops the ledger MVs built on it
drop materialized view if exists public.mv_daily_sales cascade;
drop materialized view if exists public.mv_company_sales cascade;
drop materialized view if exists public.mv_product_sales cascade;

------------------------------------------------------------------------
-- mv_daily_sales (as 20260524150000)
------------------------------------------------------------------------

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
from_historical as (
  select
    sale_date                          as day,
    'historical'::text                 as source,
    0::int                             as orders,
    coalesce(sum(amount), 0)::numeric  as revenue,
    0::numeric                         as support_fund_used,
    0::numeric                         as credit_earned
  from public.historical_sales
  group by 1
)
select * from from_orders
union all
select * from from_historical;

create unique index mv_daily_sales_pk_idx on public.mv_daily_sales (day, source);
create index mv_daily_sales_day_idx on public.mv_daily_sales (day);

------------------------------------------------------------------------
-- mv_company_sales (as 20260524150000)
------------------------------------------------------------------------

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
from_historical as (
  select
    h.company_id,
    w.window_key,
    'historical'::text                              as source,
    0::int                                          as orders,
    coalesce(sum(h.amount), 0)::numeric             as revenue,
    0::numeric                                      as support_fund_used,
    max(h.sale_date::timestamptz)                   as last_activity_at
  from public.historical_sales h
  cross join windows w
  where h.sale_date >= (w.since)::date
  group by h.company_id, w.window_key
)
select * from from_orders
union all
select * from from_historical;

create unique index mv_company_sales_pk_idx on public.mv_company_sales (company_id, window_key, source);
create index mv_company_sales_window_revenue_idx on public.mv_company_sales (window_key, revenue desc);

------------------------------------------------------------------------
-- mv_product_sales (as 20260802160000)
------------------------------------------------------------------------

create materialized view public.mv_product_sales as
with windows as (
  select '30d'::text as window_key, (now() - interval '30 days') as since union all
  select '90d'::text,                 (now() - interval '90 days') union all
  select 'ytd'::text,                 date_trunc('year', now())
)
select
  oi.product_id,
  w.window_key,
  coalesce(sum(oi.quantity), 0)::numeric      as units,
  coalesce(sum(oi.total_price), 0)::numeric   as revenue,
  count(distinct oi.order_id)::int            as orders
from public.order_items oi
join public.orders o on o.id = oi.order_id
cross join windows w
where o.status not in ('Draft', 'Cancelled')
  and o.created_at >= w.since
  and oi.product_id is not null
  and (oi.is_support_fund_item is not true)
group by oi.product_id, w.window_key;

create unique index mv_product_sales_pk_idx on public.mv_product_sales (product_id, window_key);
create index mv_product_sales_window_revenue_idx on public.mv_product_sales (window_key, revenue desc);

------------------------------------------------------------------------
-- Permissions (recreated MVs lose grants). refresh_executive_reports() is
-- unchanged — same names and unique indexes.
------------------------------------------------------------------------

grant select on public.mv_daily_sales   to service_role;
grant select on public.mv_company_sales to service_role;
grant select on public.mv_product_sales to service_role;

revoke all on public.mv_daily_sales   from anon, authenticated;
revoke all on public.mv_company_sales from anon, authenticated;
revoke all on public.mv_product_sales from anon, authenticated;
