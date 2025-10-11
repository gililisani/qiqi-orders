-- Delete all orders for a specific user or company
-- This will delete orders and all related records (order_items, order_history, order_documents)

-- IMPORTANT: Replace 'USER_EMAIL_HERE' or 'COMPANY_NAME_HERE' with the actual value
-- Run ONE of the options below, not both

-- ========================================
-- OPTION 1: Delete by User Email
-- ========================================
-- First, find the user_id
-- SELECT id, email FROM auth.users WHERE email = 'USER_EMAIL_HERE';
-- OR find from clients table:
-- SELECT id, email, name FROM clients WHERE email = 'USER_EMAIL_HERE';

-- Then delete all orders for that user_id:
-- Replace 'USER_ID_HERE' with the actual UUID

-- Delete order_history
DELETE FROM order_history 
WHERE order_id IN (
  SELECT id FROM orders WHERE user_id = 'USER_ID_HERE'
);

-- Delete order_documents
DELETE FROM order_documents 
WHERE order_id IN (
  SELECT id FROM orders WHERE user_id = 'USER_ID_HERE'
);

-- Delete order_items
DELETE FROM order_items 
WHERE order_id IN (
  SELECT id FROM orders WHERE user_id = 'USER_ID_HERE'
);

-- Delete orders
DELETE FROM orders WHERE user_id = 'USER_ID_HERE';


-- ========================================
-- OPTION 2: Delete by Company Name
-- ========================================
-- First, find the company_id
-- SELECT id, company_name FROM companies WHERE company_name ILIKE '%COMPANY_NAME%';

-- Then delete all orders for that company_id:
-- Replace 'COMPANY_ID_HERE' with the actual UUID

/*
-- Delete order_history
DELETE FROM order_history 
WHERE order_id IN (
  SELECT id FROM orders WHERE company_id = 'COMPANY_ID_HERE'
);

-- Delete order_documents
DELETE FROM order_documents 
WHERE order_id IN (
  SELECT id FROM orders WHERE company_id = 'COMPANY_ID_HERE'
);

-- Delete order_items
DELETE FROM order_items 
WHERE order_id IN (
  SELECT id FROM orders WHERE company_id = 'COMPANY_ID_HERE'
);

-- Delete orders
DELETE FROM orders WHERE company_id = 'COMPANY_ID_HERE';
*/


-- ========================================
-- VERIFICATION QUERIES (run after deletion)
-- ========================================
-- Check remaining orders for the user:
-- SELECT COUNT(*) FROM orders WHERE user_id = 'USER_ID_HERE';

-- Check remaining orders for the company:
-- SELECT COUNT(*) FROM orders WHERE company_id = 'COMPANY_ID_HERE';

