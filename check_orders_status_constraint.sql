-- Check Orders Table Status Constraint
-- Run this in your Supabase SQL Editor

-- Check the constraint on the orders table
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'orders'::regclass 
AND conname LIKE '%status%';

-- Also check the table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name = 'status';

-- Check if there are any existing orders with different status values
SELECT DISTINCT status, COUNT(*) as count
FROM orders 
GROUP BY status
ORDER BY status;
