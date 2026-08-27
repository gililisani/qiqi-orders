-- Executed-version watermark for the Shopify order poller.
--
-- 2026-08-27: the poll re-ran the full NS ensure chain (~6-10s of API
-- calls) for EVERY order in the 30-min overlap window on every cycle.
-- During the 3PL's evening fulfillment wave that pushed runs past the
-- runtime's 60s kill, so cycles died mid-batch and the tail of the wave
-- (#7317/#7318) starved for hours.
--
-- executed_shopify_updated_at records which Shopify updated_at was FULLY
-- executed to NetSuite. Written only together with a successful state
-- write (poll + retry) — a run killed mid-execute leaves it stale, so the
-- order re-runs. The poller skips NS work when the fetched updated_at is
-- already covered.
alter table public.shopify_order_sync
  add column executed_shopify_updated_at timestamptz;

comment on column public.shopify_order_sync.executed_shopify_updated_at is
  'Shopify updated_at that was fully executed to NS (set only on successful execution; poller skips versions it already covers)';
