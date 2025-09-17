-- IMMEDIATE FIX: Run this in Supabase SQL Editor to fix the orders constraint error
-- This will allow clients to place orders with "Open" status

-- Drop the existing restrictive constraint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_status_check";

-- Add the correct constraint with all valid statuses
ALTER TABLE "orders" 
ADD CONSTRAINT "orders_status_check" 
CHECK (status IN ('Open', 'In Process', 'Done', 'Cancelled'));

-- Verify the constraint was added correctly
SELECT conname, consrc 
FROM pg_constraint 
WHERE conrelid = 'orders'::regclass 
AND conname = 'orders_status_check';
