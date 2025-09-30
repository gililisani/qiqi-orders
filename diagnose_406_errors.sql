-- Comprehensive 406 Error Diagnosis
-- Run this in your Supabase SQL Editor to check database state

-- 1. Check if RLS is enabled on clients table
SELECT 
    schemaname, 
    tablename, 
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'clients' AND schemaname = 'public';

-- 2. Check current RLS policies on clients table
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual 
FROM pg_policies 
WHERE tablename = 'clients' 
AND schemaname = 'public'
ORDER BY policyname;

-- 3. Check if the specific user exists in admins table
SELECT 
    'Admin Check' as check_type,
    id,
    email,
    name,
    created_at
FROM admins 
WHERE id = '1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76';

-- 4. Check if the specific user exists in clients table  
SELECT 
    'Client Check' as check_type,
    id,
    email,
    name,
    created_at
FROM clients 
WHERE id = '1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76';

-- 5. Test the RLS policy logic manually
SELECT 
    'RLS Test' as check_type,
    auth.uid() as current_user,
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()) as is_admin,
    EXISTS (SELECT 1 FROM clients WHERE clients.id = auth.uid()) as is_client;

-- 6. Check if we can select from clients table (this should work if RLS is correct)
SELECT 
    'Direct Query Test' as check_type,
    COUNT(*) as total_clients,
    COUNT(CASE WHEN id = '1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76' THEN 1 END) as target_client_exists
FROM clients;

-- 7. Check PostgREST configuration
SELECT 
    'PostgREST Config' as check_type,
    setting as config_value
FROM pg_settings 
WHERE name IN ('search_path', 'default_tablespace', 'timezone');

-- 8. Check if there are any constraints or triggers that might affect queries
SELECT 
    'Constraints' as check_type,
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'public.clients'::regclass;

-- 9. Check table permissions for the anon role
SELECT 
    'Permissions' as check_type,
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges 
WHERE table_name = 'clients' 
AND table_schema = 'public'
AND grantee IN ('anon', 'authenticated', 'admin');
