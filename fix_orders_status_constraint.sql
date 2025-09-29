-- Fix Orders Table Status Constraint
-- Run this in your Supabase SQL Editor

-- First, let's see what the current constraint looks like
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'orders'::regclass 
AND conname LIKE '%status%';

-- Drop the existing constraint if it exists
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Create a new constraint that matches our application values
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
CHECK (status IN ('Open', 'In Process', 'Ready', 'Done', 'Cancelled'));

-- Verify the constraint was created
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'orders'::regclass 
AND conname = 'orders_status_check';
