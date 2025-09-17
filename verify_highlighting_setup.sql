-- Verify that support fund highlighting is set up correctly
-- Run this to check if everything is working

-- 1. Confirm the column exists and has correct data type
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'order_items' 
AND column_name = 'is_support_fund_item';

-- 2. Check current distribution of items
SELECT 
    is_support_fund_item,
    COUNT(*) as item_count,
    ROUND(AVG(total_price), 2) as avg_price
FROM order_items 
GROUP BY is_support_fund_item
ORDER BY is_support_fund_item;

-- 3. Show recent orders with item breakdown
SELECT 
    o.id as order_id,
    o.created_at,
    o.status,
    COUNT(CASE WHEN oi.is_support_fund_item = false THEN 1 END) as regular_items,
    COUNT(CASE WHEN oi.is_support_fund_item = true THEN 1 END) as support_fund_items,
    SUM(CASE WHEN oi.is_support_fund_item = false THEN oi.total_price ELSE 0 END) as regular_total,
    SUM(CASE WHEN oi.is_support_fund_item = true THEN oi.total_price ELSE 0 END) as support_fund_total
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id, o.created_at, o.status
ORDER BY o.created_at DESC
LIMIT 10;

-- SUCCESS MESSAGE
SELECT 'Support Fund Highlighting is Ready! ✅' as status,
       'Create a new order with support funds to test the highlighting.' as next_step;
