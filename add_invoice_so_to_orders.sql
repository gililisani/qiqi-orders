-- Add admin-managed invoice and sales order references to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoice_number varchar(255),
  ADD COLUMN IF NOT EXISTS so_number varchar(255);

-- Optional: simple indexes if these will be queried often
CREATE INDEX IF NOT EXISTS idx_orders_invoice_number ON orders (invoice_number);
CREATE INDEX IF NOT EXISTS idx_orders_so_number ON orders (so_number);
