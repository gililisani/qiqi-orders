-- Diagnose packing_slips table structure and data
-- This will help identify the root cause of 406 errors

-- Check if table exists and its structure
SELECT 'Table structure:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'packing_slips' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if there are any packing slips in the table
SELECT 'Packing slips count:' as info;
SELECT COUNT(*) as total_count FROM packing_slips;

-- Check if there are any packing slips for the specific order
SELECT 'Packing slips for order:' as info;
SELECT COUNT(*) as order_count FROM packing_slips WHERE order_id = '0a1076a3-2566-4afd-9d7c-3fa9bd8b92a8';

-- Check RLS status
SELECT 'RLS status:' as info;
SELECT schemaname, tablename, rowsecurity, forcerowsecurity 
FROM pg_tables 
WHERE tablename = 'packing_slips';

-- Test a simple select with specific columns
SELECT 'Test select with specific columns:' as info;
SELECT id, order_id, invoice_number, shipping_method, created_at 
FROM packing_slips 
WHERE order_id = '0a1076a3-2566-4afd-9d7c-3fa9bd8b92a8'
LIMIT 1;
