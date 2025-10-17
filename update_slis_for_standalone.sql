-- Update SLIs table to support standalone SLIs (not attached to orders)

-- Make order_id nullable for standalone SLIs
ALTER TABLE slis ALTER COLUMN order_id DROP NOT NULL;

-- Add fields for manually entered data (when not from an order)
ALTER TABLE slis ADD COLUMN IF NOT EXISTS consignee_name TEXT;
ALTER TABLE slis ADD COLUMN IF NOT EXISTS consignee_address_line1 TEXT;
ALTER TABLE slis ADD COLUMN IF NOT EXISTS consignee_address_line2 TEXT;
ALTER TABLE slis ADD COLUMN IF NOT EXISTS consignee_address_line3 TEXT;
ALTER TABLE slis ADD COLUMN IF NOT EXISTS consignee_country TEXT;
ALTER TABLE slis ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE slis ADD COLUMN IF NOT EXISTS sli_date DATE;

-- Add a type field to distinguish standalone vs order-based SLIs
ALTER TABLE slis ADD COLUMN IF NOT EXISTS sli_type TEXT DEFAULT 'order' CHECK (sli_type IN ('order', 'standalone'));

-- Add manual products field for standalone SLIs (JSONB array of products)
-- Each product: { hs_code, quantity, uom, weight, eccn, license_symbol, value, description }
ALTER TABLE slis ADD COLUMN IF NOT EXISTS manual_products JSONB DEFAULT '[]';

-- Update RLS policies to allow admins full access to standalone SLIs
DROP POLICY IF EXISTS "Admins can view all SLIs" ON slis;
CREATE POLICY "Admins can view all SLIs"
  ON slis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins WHERE admins.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can create SLIs" ON slis;
CREATE POLICY "Admins can create SLIs"
  ON slis FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins WHERE admins.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can update SLIs" ON slis;
CREATE POLICY "Admins can update SLIs"
  ON slis FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admins WHERE admins.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can delete SLIs" ON slis;
CREATE POLICY "Admins can delete SLIs"
  ON slis FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM admins WHERE admins.id = auth.uid()
    )
  );

-- Clients can view SLIs for their company's orders (standalone SLIs are admin-only)
DROP POLICY IF EXISTS "Clients can view their company SLIs" ON slis;
CREATE POLICY "Clients can view their company SLIs"
  ON slis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients
      JOIN orders ON orders.company_id = clients.company_id
      WHERE clients.id = auth.uid()
      AND slis.order_id = orders.id
      AND slis.sli_type = 'order'
    )
  );

