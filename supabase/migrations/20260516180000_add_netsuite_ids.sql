-- Add NetSuite internal IDs to reference tables
ALTER TABLE companies ADD COLUMN IF NOT EXISTS netsuite_internal_id TEXT;
ALTER TABLE subsidiaries ADD COLUMN IF NOT EXISTS netsuite_id TEXT;
ALTER TABLE "Locations" ADD COLUMN IF NOT EXISTS netsuite_id TEXT;

-- Add NetSuite tracking fields to orders
-- netsuite_so_id: internal NS record ID used for API calls (so_number stays as human-readable display field)
-- netsuite_invoice_id: internal NS invoice record ID for API calls
ALTER TABLE orders ADD COLUMN IF NOT EXISTS netsuite_so_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS netsuite_invoice_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS netsuite_invoice_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS netsuite_invoice_status TEXT;

-- Inventory levels synced from NetSuite per location
CREATE TABLE IF NOT EXISTS inventory_levels (
  product_id    INTEGER NOT NULL REFERENCES "Products"(id) ON DELETE CASCADE,
  location_id   UUID    NOT NULL REFERENCES "Locations"(id) ON DELETE CASCADE,
  quantity_on_hand    NUMERIC DEFAULT 0,
  quantity_available  NUMERIC DEFAULT 0,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (product_id, location_id)
);

ALTER TABLE inventory_levels ENABLE ROW LEVEL SECURITY;

-- Admins can read/write; clients have no direct access (served via API route)
CREATE POLICY "Admins manage inventory_levels"
  ON inventory_levels FOR ALL
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());
