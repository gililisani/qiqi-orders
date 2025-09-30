-- Test the exact query that's failing in the application
-- This simulates what the application is trying to do

-- First, let's check what user we're testing with
SELECT 
    'Current User Info' as test_type,
    auth.uid() as user_id,
    auth.role() as user_role;

-- Test the exact query that's failing: 
-- SELECT name,email FROM clients WHERE id = '1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76'
SELECT 
    'Client Query Test' as test_type,
    id,
    name,
    email,
    created_at
FROM clients 
WHERE id = '1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76';

-- Test if we can query clients table at all
SELECT 
    'All Clients Test' as test_type,
    COUNT(*) as total_count
FROM clients;

-- Test if the user exists in admins table (which should allow them to query clients)
SELECT 
    'Admin Existence Test' as test_type,
    EXISTS (
        SELECT 1 FROM admins 
        WHERE admins.id = '1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76'
    ) as user_is_admin;

-- Test the RLS policy condition directly
SELECT 
    'RLS Policy Test' as test_type,
    EXISTS (
        SELECT 1 FROM admins 
        WHERE admins.id = auth.uid()
    ) as current_user_is_admin;
