-- Create order_history table to track all order activities
-- This table logs all changes and activities related to orders

CREATE TABLE IF NOT EXISTS order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  status_from TEXT,
  status_to TEXT,
  document_type TEXT,
  document_filename TEXT,
  notes TEXT,
  changed_by_id UUID NOT NULL,
  changed_by_name TEXT NOT NULL,
  changed_by_role TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON order_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_created_at ON order_history(created_at DESC);

-- Add RLS policies
ALTER TABLE order_history ENABLE ROW LEVEL SECURITY;

-- Admin can see all history
CREATE POLICY "Admins can view all order history"
  ON order_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins WHERE admins.id = auth.uid()
    )
  );

-- Clients can see history for their company's orders
CREATE POLICY "Clients can view their company's order history"
  ON order_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN clients c ON c.company_id = o.company_id
      WHERE o.id = order_history.order_id
        AND c.id = auth.uid()
    )
  );

-- Admin can insert history
CREATE POLICY "Admins can insert order history"
  ON order_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins WHERE admins.id = auth.uid()
    )
  );

-- Clients can insert history for their company's orders
CREATE POLICY "Clients can insert order history for their company"
  ON order_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN clients c ON c.company_id = o.company_id
      WHERE o.id = order_history.order_id
        AND c.id = auth.uid()
    )
  );

-- Add comments
COMMENT ON TABLE order_history IS 'Tracks all activities and changes related to orders';
COMMENT ON COLUMN order_history.action_type IS 'Type of action: order_created, status_change, document_uploaded, packing_slip_created, order_updated';
COMMENT ON COLUMN order_history.changed_by_role IS 'Role of user who made the change: admin, client, or system';

