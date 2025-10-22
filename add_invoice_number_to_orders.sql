-- Add invoice_number field to orders table
-- This field will store the invoice number for packing slips

ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_number TEXT;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_orders_invoice_number ON orders(invoice_number);

-- Update existing orders with a default invoice number format
-- Format: INV-{order_id_short}-{date}
UPDATE orders 
SET invoice_number = 'INV-' || SUBSTRING(id, 1, 8) || '-' || TO_CHAR(created_at, 'YYYYMMDD')
WHERE invoice_number IS NULL;
