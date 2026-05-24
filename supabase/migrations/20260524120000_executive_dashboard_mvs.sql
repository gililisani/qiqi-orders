-- Executive Dashboard materialized views.
--
-- Three MVs pre-aggregate the heavy queries that back /admin/reports:
--   - mv_daily_sales        : daily revenue / order count / support fund used
--   - mv_company_sales      : per-company rollup for 30d / 90d / YTD windows
--   - mv_product_sales      : per-product rollup for 30d / 90d / YTD windows
--
-- "Committed" revenue excludes Draft + Cancelled. Order status funnel is NOT
-- in an MV — the dashboard queries `orders` live for that, so funnel always
-- reflects current state.
--
-- Refreshed nightly by public.refresh_executive_reports(). If pg_cron is
-- enabled in the project, the schedule below activates it automatically;
-- otherwise call the function manually or wire it to a Supabase scheduled
-- job. CONCURRENTLY refresh requires the unique indexes defined below.

------------------------------------------------------------------------
-- mv_daily_sales
------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_sales CASCADE;

CREATE MATERIALIZED VIEW public.mv_daily_sales AS
SELECT
  (created_at AT TIME ZONE 'UTC')::date         AS day,
  COUNT(*)::int                                  AS orders,
  COALESCE(SUM(total_value), 0)::numeric         AS revenue,
  COALESCE(SUM(support_fund_used), 0)::numeric   AS support_fund_used,
  COALESCE(SUM(credit_earned), 0)::numeric       AS credit_earned
FROM public.orders
WHERE status NOT IN ('Draft', 'Cancelled')
GROUP BY 1;

CREATE UNIQUE INDEX mv_daily_sales_day_idx
  ON public.mv_daily_sales (day);

------------------------------------------------------------------------
-- mv_company_sales
--
-- Pre-rolls top-companies queries for the three windows the dashboard
-- exposes (30d, 90d, ytd). Keeping all three in one MV means the API
-- never has to re-aggregate at request time — it just filters by window.
------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS public.mv_company_sales CASCADE;

CREATE MATERIALIZED VIEW public.mv_company_sales AS
WITH windows AS (
  SELECT '30d'::text AS window_key, (now() - interval '30 days') AS since UNION ALL
  SELECT '90d'::text,                 (now() - interval '90 days') UNION ALL
  SELECT 'ytd'::text,                 date_trunc('year', now())
)
SELECT
  o.company_id,
  w.window_key,
  COUNT(*)::int                                AS orders,
  COALESCE(SUM(o.total_value), 0)::numeric     AS revenue,
  COALESCE(SUM(o.support_fund_used), 0)::numeric AS support_fund_used,
  MAX(o.created_at)                            AS last_order_at
FROM public.orders o
CROSS JOIN windows w
WHERE o.status NOT IN ('Draft', 'Cancelled')
  AND o.created_at >= w.since
  AND o.company_id IS NOT NULL
GROUP BY o.company_id, w.window_key;

CREATE UNIQUE INDEX mv_company_sales_pk_idx
  ON public.mv_company_sales (company_id, window_key);

CREATE INDEX mv_company_sales_window_revenue_idx
  ON public.mv_company_sales (window_key, revenue DESC);

------------------------------------------------------------------------
-- mv_product_sales
------------------------------------------------------------------------

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
GROUP BY oi.product_id, w.window_key;

CREATE UNIQUE INDEX mv_product_sales_pk_idx
  ON public.mv_product_sales (product_id, window_key);

CREATE INDEX mv_product_sales_window_revenue_idx
  ON public.mv_product_sales (window_key, revenue DESC);

------------------------------------------------------------------------
-- Refresh function + permissions
--
-- SECURITY DEFINER so a scheduled job (or a manual invocation by an
-- admin) can refresh without owning the MVs. Locked down per project
-- convention: only service_role can EXECUTE.
------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_executive_reports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_sales;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_company_sales;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_product_sales;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_executive_reports() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_executive_reports() TO service_role;

-- Allow service_role to SELECT from the MVs (it already can as superuser-ish,
-- but be explicit). Do NOT grant to anon/authenticated — these are queried
-- only via the admin-guarded API route using service_role.
GRANT SELECT ON public.mv_daily_sales   TO service_role;
GRANT SELECT ON public.mv_company_sales TO service_role;
GRANT SELECT ON public.mv_product_sales TO service_role;

REVOKE ALL ON public.mv_daily_sales   FROM anon, authenticated;
REVOKE ALL ON public.mv_company_sales FROM anon, authenticated;
REVOKE ALL ON public.mv_product_sales FROM anon, authenticated;

------------------------------------------------------------------------
-- Nightly schedule via pg_cron (optional).
--
-- Wrapped in a DO block so the migration succeeds even if pg_cron isn't
-- installed. If you'd rather schedule from the Supabase dashboard, skip
-- enabling pg_cron and call refresh_executive_reports() from a scheduled
-- Edge Function instead.
------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove any prior schedule with this name, then re-add at 03:00 UTC.
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'refresh_executive_reports_nightly';

    PERFORM cron.schedule(
      'refresh_executive_reports_nightly',
      '0 3 * * *',
      $cron$ SELECT public.refresh_executive_reports(); $cron$
    );
  END IF;
END;
$$;

-- (CREATE MATERIALIZED VIEW above already populated the MVs; first cron
-- run will be a true refresh.)
