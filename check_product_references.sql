-- Check if product ID 1 is referenced in any existing orders before deletion

-- Check order_items that reference product ID 1
SELECT 
  oi.id as order_item_id,
  oi.order_id,
  oi.product_id,
  oi.quantity,
  o.status as order_status,
  o.created_at as order_date,
  p.item_name as product_name,
  p.sku as product_sku
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
JOIN "Products" p ON oi.product_id = p.id
WHERE oi.product_id = 1
ORDER BY o.created_at DESC;

-- Count total references
SELECT COUNT(*) as total_references
FROM order_items 
WHERE product_id = 1;

-- Show the duplicate products for comparison
SELECT 
  id,
  item_name,
  sku,
  case_pack,
  price_americas,
  price_international,
  created_at
FROM "Products" 
WHERE id IN (1, 5)
ORDER BY id;
