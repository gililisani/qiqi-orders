-- Delete the broken order that has no order_items
-- This will also delete any related records due to foreign key constraints

-- First, delete the order (this should cascade delete any related records)
DELETE FROM orders 
WHERE id = '1d9e797d-2d04-4ed1-af8a-901a667e83cc';

-- Verify the deletion
SELECT 
    id,
    created_at,
    status,
    total_value
FROM orders 
WHERE id = '1d9e797d-2d04-4ed1-af8a-901a667e83cc';

-- Should return: Success. No rows returned
