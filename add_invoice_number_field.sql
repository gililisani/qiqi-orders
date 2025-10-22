-- Add invoice_number field to orders table
-- This field is used when Admin changes order status to Ready/Done

ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_number TEXT;
