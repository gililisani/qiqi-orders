-- Add 'Draft' status to the orders table check constraint
-- This allows orders to be saved with status = 'Draft'

-- First, drop the existing constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Add the new constraint with 'Draft' included
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
CHECK (status IN ('Draft', 'Open', 'In Process', 'Ready', 'Done', 'Cancelled'));

