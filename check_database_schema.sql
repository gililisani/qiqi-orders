-- Database Schema Check Script
-- Run this in your Supabase SQL editor and send me the output

-- 1. List all tables in the public schema
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. Check specific tables that we're using in the code
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
    AND table_name IN (
        'orders',
        'order_items', 
        'products',
        'Products',
        'companies',
        'clients',
        'support_fund_levels',
        'subsidiaries',
        'classes',
        'locations',
        'Locations',
        'admins',
        'packing_slips'
    )
ORDER BY table_name, ordinal_position;

-- 3. Check if there are any case-sensitive table name issues
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'public'
    AND (tablename ILIKE '%product%' 
         OR tablename ILIKE '%order%' 
         OR tablename ILIKE '%location%')
ORDER BY tablename;

-- 4. Check foreign key relationships for orders and order_items
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name IN ('orders', 'order_items')
ORDER BY tc.table_name, kcu.column_name;
