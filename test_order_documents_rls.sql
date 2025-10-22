-- Test script to check order_documents RLS policies
-- Run this to see what's happening with the RLS policies

-- Check if the table exists and has RLS enabled
SELECT 
  schemaname, 
  tablename, 
  rowsecurity 
FROM pg_tables 
WHERE tablename = 'order_documents';

-- Check existing policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'order_documents';

-- Test query to see if a client can access documents
-- (This should be run as a client user to test RLS)
SELECT 
  od.*,
  o.po_number,
  c.company_name
FROM order_documents od
JOIN orders o ON o.id = od.order_id
JOIN companies c ON c.id = o.company_id
LIMIT 5;
