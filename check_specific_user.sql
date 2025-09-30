-- Check if the specific user ID exists in clients table
-- This user ID is causing 406 errors: 1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76

-- Check if this user exists in clients table
SELECT 
    'User in clients table' as check_type,
    id,
    name,
    email,
    created_at
FROM clients 
WHERE id = '1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76';

-- Check if this user exists in admins table
SELECT 
    'User in admins table' as check_type,
    id,
    name,
    email,
    created_at
FROM admins 
WHERE id = '1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76';

-- Check what orders have this user_id
SELECT 
    'Orders with this user_id' as check_type,
    id,
    status,
    created_at,
    user_id
FROM orders 
WHERE user_id = '1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76'
LIMIT 5;
