-- Check all orders and their associations
SELECT 
  o.id as order_id,
  o.po_number,
  o.status,
  o.company_id,
  o.user_id,
  o.created_at,
  c.company_name,
  u.email as creator_email,
  CASE 
    WHEN cl.id IS NOT NULL THEN 'Client'
    WHEN ad.id IS NOT NULL THEN 'Admin'  
    ELSE 'Unknown'
  END as creator_type
FROM orders o
LEFT JOIN companies c ON o.company_id = c.id
LEFT JOIN auth.users u ON o.user_id = u.id
LEFT JOIN clients cl ON o.user_id = cl.id
LEFT JOIN admins ad ON o.user_id = ad.id
ORDER BY o.created_at DESC;
