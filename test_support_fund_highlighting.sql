-- Test script to verify support fund highlighting works
-- This will help test the highlighting feature

-- 1. Check if the column exists
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'order_items' 
AND column_name = 'is_support_fund_item';

-- 2. View current order_items with support fund flag
SELECT 
    oi.id,
    oi.order_id,
    oi.is_support_fund_item,
    p.item_name,
    oi.quantity,
    oi.unit_price,
    oi.total_price
FROM order_items oi
LEFT JOIN "Products" p ON p.id = oi.product_id
ORDER BY oi.order_id, oi.is_support_fund_item;

-- 3. Count regular vs support fund items
SELECT 
    is_support_fund_item,
    COUNT(*) as item_count,
    SUM(total_price) as total_value
FROM order_items 
GROUP BY is_support_fund_item;

-- 4. For testing: Manually mark some items as support fund items
-- (ONLY run this if you want to test with existing data)
-- UPDATE order_items 
-- SET is_support_fund_item = TRUE 
-- WHERE id IN (
--     SELECT id FROM order_items 
--     WHERE order_id = 'YOUR_TEST_ORDER_ID' 
--     LIMIT 1
-- );

-- 5. Verify the highlighting query works
SELECT 
    o.id as order_id,
    o.status,
    oi.id as item_id,
    oi.is_support_fund_item,
    p.item_name,
    CASE 
        WHEN oi.is_support_fund_item = TRUE THEN 'SHOULD BE HIGHLIGHTED'
        ELSE 'REGULAR ITEM'
    END as highlight_status
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN "Products" p ON p.id = oi.product_id
ORDER BY o.created_at DESC, oi.is_support_fund_item
LIMIT 20;
