-- Fold historical_sales into the executive dashboard aggregates.
--
-- historical_sales is the pre-NetSuite backfill table (company × date ×
-- amount) used to make Annual Goals accurate before the integration is
-- live. It must contribute to revenue / partners / top-companies in the
-- dashboard — otherwise YTD numbers under-report by the backfilled amount.
--
-- AOV, Top Products, the Order Status Funnel and Support Fund Used stay
-- orders-only: historical_sales has no concept of an order, product or
-- status, and no support-fund column.
--
-- Strategy: rebuild the three MVs with UNION ALL between orders-derived
-- rows and historical-derived rows. A `source` column ('orders' /
-- 'historical') is added so future reports can split if they need to.
--
-- Drop + recreate is fine — they're refreshed nightly and held no state.

DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_sales   CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_company_sales CASCADE;

------------------------------------------------------------------------
-- mv_daily_sales
------------------------------------------------------------------------

CREATE MATERIALIZED VIEW public.mv_daily_sales AS
WITH from_orders AS (
  SELECT
    (created_at AT TIME ZONE 'UTC')::date           AS day,
    'orders'::text                                   AS source,
    COUNT(*)::int                                    AS orders,
    COALESCE(SUM(total_value), 0)::numeric           AS revenue,
    COALESCE(SUM(support_fund_used), 0)::numeric     AS support_fund_used,
    COALESCE(SUM(credit_earned), 0)::numeric         AS credit_earned
  FROM public.orders
  WHERE status NOT IN ('Draft', 'Cancelled')
  GROUP BY 1
),
from_historical AS (
  SELECT
    sale_date                          AS day,
    'historical'::text                 AS source,
    0::int                             AS orders,         -- no order concept
    COALESCE(SUM(amount), 0)::numeric  AS revenue,
    0::numeric                         AS support_fund_used,
    0::numeric                         AS credit_earned
  FROM public.historical_sales
  GROUP BY 1
)
SELECT * FROM from_orders
UNION ALL
SELECT * FROM from_historical;

CREATE UNIQUE INDEX mv_daily_sales_pk_idx
  ON public.mv_daily_sales (day, source);

CREATE INDEX mv_daily_sales_day_idx
  ON public.mv_daily_sales (day);

------------------------------------------------------------------------
-- mv_company_sales
--
-- Same 30d / 90d / YTD pre-roll, but UNION ALL between orders + historical
-- per company × window. Consumers sum revenue / orders across both sources
-- (or filter on `source` if they want orders-only).
------------------------------------------------------------------------

CREATE MATERIALIZED VIEW public.mv_company_sales AS
WITH windows AS (
  SELECT '30d'::text AS window_key, (now() - interval '30 days') AS since UNION ALL
  SELECT '90d'::text,                 (now() - interval '90 days') UNION ALL
  SELECT 'ytd'::text,                 date_trunc('year', now())
),
from_orders AS (
  SELECT
    o.company_id,
    w.window_key,
    'orders'::text                                  AS source,
    COUNT(*)::int                                   AS orders,
    COALESCE(SUM(o.total_value), 0)::numeric        AS revenue,
    COALESCE(SUM(o.support_fund_used), 0)::numeric  AS support_fund_used,
    MAX(o.created_at)                               AS last_activity_at
  FROM public.orders o
  CROSS JOIN windows w
  WHERE o.status NOT IN ('Draft', 'Cancelled')
    AND o.created_at >= w.since
    AND o.company_id IS NOT NULL
  GROUP BY o.company_id, w.window_key
),
from_historical AS (
  SELECT
    h.company_id,
    w.window_key,
    'historical'::text                              AS source,
    0::int                                          AS orders,
    COALESCE(SUM(h.amount), 0)::numeric             AS revenue,
    0::numeric                                      AS support_fund_used,
    MAX(h.sale_date::timestamptz)                   AS last_activity_at
  FROM public.historical_sales h
  CROSS JOIN windows w
  WHERE h.sale_date >= (w.since)::date
  GROUP BY h.company_id, w.window_key
)
SELECT * FROM from_orders
UNION ALL
SELECT * FROM from_historical;

CREATE UNIQUE INDEX mv_company_sales_pk_idx
  ON public.mv_company_sales (company_id, window_key, source);

CREATE INDEX mv_company_sales_window_revenue_idx
  ON public.mv_company_sales (window_key, revenue DESC);

------------------------------------------------------------------------
-- Permissions (recreated MVs lose grants).
------------------------------------------------------------------------

GRANT SELECT ON public.mv_daily_sales   TO service_role;
GRANT SELECT ON public.mv_company_sales TO service_role;

REVOKE ALL ON public.mv_daily_sales   FROM anon, authenticated;
REVOKE ALL ON public.mv_company_sales FROM anon, authenticated;

-- mv_product_sales is untouched (historical has no product breakdown),
-- but refresh_executive_reports() still refreshes all three together.
