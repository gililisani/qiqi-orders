-- Weekly FBA claimable-losses snapshot (lost/damaged units Amazon hasn't
-- reimbursed, within the 60-day claim window). Computed by the
-- /api/cron/amazon-claims job and on-demand refresh; the Amazon FBA page
-- panel reads it. Replaces the removed Stock Drift panel's role.

alter table public.amazon_fba_config
  add column if not exists claims_snapshot jsonb;
