-- Dashboard v2: cached store-wide financial snapshot (computed by the
-- 15-min poll cron from Shopify; read instantly by /admin/shopify).
alter table public.shopify_sync_config add column if not exists financial_snapshot jsonb;
