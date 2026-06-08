-- Inventory Investigation — data-integrity residuals.
--
-- A "phantom residual" is the gap between NetSuite's current on-hand for an
-- (item, location) and the sum of its visible inventory-affecting transactions.
-- A nonzero residual means NS on-hand can't be explained by transaction history
-- (a pre-history / migration artifact). The balance engine zero-anchors and
-- surfaces these rather than smearing them into the curve; this table is the
-- catalog-wide list, populated by "Refresh All from NetSuite".

CREATE TABLE IF NOT EXISTS public.inv_inv_residuals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code      TEXT NOT NULL,
  ns_item_id     TEXT,
  item_name      TEXT,
  location_ns_id TEXT NOT NULL,
  location_name  TEXT,
  current_qoh    NUMERIC NOT NULL,   -- NetSuite on-hand
  tx_sum         NUMERIC NOT NULL,   -- sum of pulled inventory-affecting transactions
  residual       NUMERIC NOT NULL,   -- current_qoh − tx_sum (nonzero)
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_code, location_ns_id)
);

CREATE INDEX IF NOT EXISTS inv_inv_residuals_abs_idx ON public.inv_inv_residuals (residual);

ALTER TABLE public.inv_inv_residuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_inv_residuals_admin_all
  ON public.inv_inv_residuals FOR ALL TO authenticated
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
