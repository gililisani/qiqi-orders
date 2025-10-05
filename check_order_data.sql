-- Check the actual data in order_items for the problematic order
SELECT 
    oi.id,
    oi.order_id,
    oi.product_id,
    oi.quantity,
    oi.unit_price,
    oi.total_price,
    oi.is_support_fund_item,
    oi.created_at,
    p.item_name,
    p.sku
FROM order_items oi
LEFT JOIN "Products" p ON oi.product_id = p.id
WHERE oi.order_id = '1d9e797d-2d04-4ed1-af8a-901a667e83cc'
ORDER BY oi.is_support_fund_item, oi.created_at;

-- Also check the order itself
SELECT 
    id,
    created_at,
    user_id,
    company_id,
    status,
    total_value,
    support_fund_used,
    po_number,
    credit_earned
FROM orders 
WHERE id = '1d9e797d-2d04-4ed1-af8a-901a667e83cc';

-- Compare with the working order
SELECT 
    oi.id,
    oi.order_id,
    oi.product_id,
    oi.quantity,
    oi.unit_price,
    oi.total_price,
    oi.is_support_fund_item,
    oi.created_at,
    p.item_name,
    p.sku
FROM order_items oi
LEFT JOIN "Products" p ON oi.product_id = p.id
WHERE oi.order_id = '7e49032c-a1ca-4505-b96b-f21b79c7347d'
ORDER BY oi.is_support_fund_item, oi.created_at;
