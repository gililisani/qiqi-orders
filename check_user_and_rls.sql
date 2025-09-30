-- Check specific user and RLS conditions
-- Run this in Supabase SQL Editor

-- 1. Check if RLS is enabled on clients table
SELECT 
    'RLS Status' as check_type,
    schemaname, 
    tablename, 
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'clients' AND schemaname = 'public';

-- 2. Check if the specific user exists in admins table
SELECT 
    'Admin Check' as check_type,
    id,
    email,
    name,
    created_at
FROM admins 
WHERE id = '1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76';

-- 3. Check current authenticated user
SELECT 
    'Current User' as check_type,
    auth.uid() as user_id,
    auth.role() as user_role;

-- 4. Test the RLS policy condition manually
SELECT 
    'RLS Policy Test' as check_type,
    auth.uid() as current_user,
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()) as is_admin;

-- 5. Try the exact failing query
SELECT 
    'Client Query Test' as check_type,
    id,
    name,
    email
FROM clients 
WHERE id = '1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76';
