-- WP10 (audit 9.3): mv_product_sales counted support-fund line items — free
-- redeemed goods carried at full catalog price — so product-level revenue
-- systematically overstated order-level revenue. Recreate with SF lines
-- excluded (IS NOT TRUE keeps legacy rows where the flag is null), matching
-- the live product-insights / sales-explorer queries deployed with this
-- migration. The MV repopulates on CREATE; nightly refresh is unchanged.

DROP MATERIALIZED VIEW IF EXISTS public.mv_product_sales CASCADE;

CREATE MATERIALIZED VIEW public.mv_product_sales AS
WITH windows AS (
  SELECT '30d'::text AS window_key, (now() - interval '30 days') AS since UNION ALL
  SELECT '90d'::text,                 (now() - interval '90 days') UNION ALL
  SELECT 'ytd'::text,                 date_trunc('year', now())
)
SELECT
  oi.product_id,
  w.window_key,
  COALESCE(SUM(oi.quantity), 0)::numeric      AS units,
  COALESCE(SUM(oi.total_price), 0)::numeric   AS revenue,
  COUNT(DISTINCT oi.order_id)::int            AS orders
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
CROSS JOIN windows w
WHERE o.status NOT IN ('Draft', 'Cancelled')
  AND o.created_at >= w.since
  AND oi.product_id IS NOT NULL
  AND (oi.is_support_fund_item IS NOT TRUE)
GROUP BY oi.product_id, w.window_key;

CREATE UNIQUE INDEX mv_product_sales_pk_idx
  ON public.mv_product_sales (product_id, window_key);

CREATE INDEX mv_product_sales_window_revenue_idx
  ON public.mv_product_sales (window_key, revenue DESC);
