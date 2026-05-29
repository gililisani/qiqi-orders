-- Inventory Investigation & Simulation Tool — cache tables.
--
-- Decision-support tool for diagnosing negative-inventory problems in NetSuite.
-- These tables cache data PULLED from NetSuite (via SuiteQL) so the UI doesn't
-- re-hit NetSuite on every page load. Nothing here is ever pushed back to NS.
--
-- Access: admin-only. The tool is fetched through API routes that use the
-- service-role client (which bypasses RLS), so the browser never queries these
-- tables directly. We still enable RLS + an admin-only policy per project rule
-- ("new tables: enable RLS on creation, add policies in the same migration").
--
-- Naming: inv_inv_* keeps these grouped and distinct from the existing
-- `inventory_levels` table (current QOH per product/location), which is untouched.

-- ---------------------------------------------------------------------------
-- 1. Item header — one row per investigated item, plus refresh bookkeeping.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inv_inv_items (
  item_code         TEXT PRIMARY KEY,          -- = NS itemid / Products.sku (e.g. COM0059)
  ns_item_id        TEXT,                       -- NetSuite internal id
  item_name         TEXT,
  item_type         TEXT,                       -- 'Inventory Item' | 'Assembly'
  date_min          DATE,                       -- earliest observed tran date (default zoom)
  date_max          DATE,                       -- latest observed tran date
  last_refreshed_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Transactions — one SIGNED row per (item, transaction, location).
--    Inventory Transfers produce TWO rows (source leg negative, dest leg
--    positive) sharing ns_transaction_id + doc_number; transfer_group +
--    transfer_leg make that pairing explicit.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inv_inv_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code         TEXT NOT NULL REFERENCES public.inv_inv_items(item_code) ON DELETE CASCADE,
  ns_transaction_id TEXT NOT NULL,              -- NS transaction internal id (sort tiebreak #2)
  line_id           TEXT NOT NULL,              -- transactionline id (sort tiebreak #3)
  doc_number        TEXT,                       -- tranid (human doc #, transfer pairing key)
  tran_date         DATE NOT NULL,              -- posting date (sort key #1, ASC)
  tran_type         TEXT NOT NULL,              -- normalized: IR|IF|IT|BUILD|UNBUILD|ADJ|BILL
  ns_type           TEXT,                       -- raw NS type code (ItemRcpt, InvTrnfr, ...)
  location_ns_id    TEXT NOT NULL,
  location_name     TEXT,
  signed_qty        NUMERIC NOT NULL,           -- +inbound / -outbound at this location
  transfer_group    TEXT,                       -- doc_number for IT rows; pairs the two legs
  transfer_leg      TEXT,                       -- 'source' | 'dest' (transfers only)
  memo              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ns_transaction_id, line_id, location_ns_id)
);

CREATE INDEX IF NOT EXISTS inv_inv_transactions_item_idx
  ON public.inv_inv_transactions (item_code, location_ns_id, tran_date);
CREATE INDEX IF NOT EXISTS inv_inv_transactions_nstx_idx
  ON public.inv_inv_transactions (ns_transaction_id);

-- ---------------------------------------------------------------------------
-- 3. Opening balances — per (item, location). The ground-truth anchor.
--    opening_qty = current_qoh - SUM(pulled signed_qty)  [implied pre-window]
--    Running balances start from opening_qty; final balance reconstructs to
--    current_qoh by construction.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inv_inv_opening_balances (
  item_code      TEXT NOT NULL REFERENCES public.inv_inv_items(item_code) ON DELETE CASCADE,
  location_ns_id TEXT NOT NULL,
  location_name  TEXT,
  opening_qty    NUMERIC NOT NULL DEFAULT 0,
  current_qoh    NUMERIC NOT NULL DEFAULT 0,    -- NS inventorybalance snapshot at refresh time
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_code, location_ns_id)
);

-- ---------------------------------------------------------------------------
-- 4. Plan markers — "I plan to fix this" notes from the simulator (Phase 3).
--    Keyed on ns_transaction_id so they SURVIVE a refresh-from-NetSuite:
--    re-pulling transactions never touches this table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inv_inv_plan_markers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code         TEXT NOT NULL,
  ns_transaction_id TEXT NOT NULL,
  planned_action    TEXT,                       -- 'change_date' | 'change_qty' | 'delete'
  proposed_value    TEXT,                       -- free-form: the new date/qty being considered
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_code, ns_transaction_id)
);

-- ---------------------------------------------------------------------------
-- RLS — admin-only on all four tables.
-- ---------------------------------------------------------------------------
ALTER TABLE public.inv_inv_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_inv_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_inv_opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_inv_plan_markers     ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_inv_items_admin_all
  ON public.inv_inv_items FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

CREATE POLICY inv_inv_transactions_admin_all
  ON public.inv_inv_transactions FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

CREATE POLICY inv_inv_opening_balances_admin_all
  ON public.inv_inv_opening_balances FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

CREATE POLICY inv_inv_plan_markers_admin_all
  ON public.inv_inv_plan_markers FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
