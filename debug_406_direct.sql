-- Direct test of the failing query
-- This will help us understand if the issue is database-level or application-level

-- Test 1: Check if the user exists in admins table
SELECT 
    'User Admin Check' as test,
    id,
    email,
    name
FROM admins 
WHERE id = '1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76';

-- Test 2: Try the exact failing query manually
SELECT 
    'Manual Query Test' as test,
    id,
    name,
    email
FROM clients 
WHERE id = '1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76';

-- Test 3: Check if RLS is actually blocking this
-- First, let's see what policies exist
SELECT 
    'RLS Policies' as test,
    policyname,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'clients' 
AND schemaname = 'public';

-- Test 4: Check current user context
SELECT 
    'Current Context' as test,
    current_user as db_user,
    session_user as session_user,
    current_setting('request.jwt.claims', true) as jwt_claims;

-- Test 5: Try to simulate what the app is doing
-- This should work if RLS is correct
SELECT 
    'Simulated App Query' as test,
    COUNT(*) as total_clients
FROM clients;
