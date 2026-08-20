-- Historical sales v2 — per-invoice rows, support funds, NetSuite import.
--
-- v1 stored one lump amount per company per DAY (monthly backfill design);
-- the unique (company_id, sale_date) index made any second sale on a date
-- fail with "duplicate key … idx_historical_sales_unique". Real history is
-- per-invoice, and the owner wants the SF discount captured per sale.
--
-- New shape: one row per historical NetSuite invoice (or manual entry).
--   reference            — human id (NS invoice tranid) shown in the UI
--   netsuite_invoice_id  — NS internal id; links the row to the NS
--                          invoice (and through it the SO / payment), and
--                          makes re-imports idempotent
--   support_fund         — SF for this sale, read from the NS discount
--                          lines ("Marketing Support Funds …" /
--                          "Partners Support Funds") on import; editable.
--                          REPORTING-ONLY: order-form SF budgets are
--                          computed per order and never read this table.
--   source               — 'manual' | 'netsuite'

alter table public.historical_sales
  add column if not exists reference text,
  add column if not exists netsuite_invoice_id text,
  add column if not exists support_fund numeric(12,2) not null default 0,
  add column if not exists source text not null default 'manual';

-- The one-per-day rule goes away (it was the duplicate-key bug).
drop index if exists idx_historical_sales_unique;

-- Idempotent imports: one row per NS invoice per company. NULLs are
-- distinct in Postgres unique indexes, so manual rows (no NS id) are
-- unlimited. Full (non-partial) index so ON CONFLICT can infer it.
create unique index if not exists idx_historical_sales_ns_invoice
  on public.historical_sales (company_id, netsuite_invoice_id);
