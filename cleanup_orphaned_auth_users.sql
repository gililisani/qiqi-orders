-- Cleanup Script: Find orphaned Supabase Auth users
-- 
-- This query helps identify users who exist in Supabase Auth
-- but don't have a corresponding record in our clients table.
-- 
-- Run this in Supabase SQL Editor to see the issue, then
-- manually delete orphaned auth users from the Auth dashboard.

-- Step 1: Find all auth users (run this in your application to get the list)
-- You'll need to use Supabase Admin API to list auth users
-- Then compare with clients table

-- For now, let's check our clients table
SELECT 
  id,
  email,
  name,
  company_id,
  enabled,
  created_at
FROM clients
ORDER BY created_at DESC;

-- Notes:
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Compare the users list with the query results above
-- 3. Any user in Auth but NOT in clients table = orphaned auth user
-- 4. Delete those orphaned users manually from the Auth dashboard
--
-- Going forward, the new /api/users/delete endpoint will properly clean up both!

