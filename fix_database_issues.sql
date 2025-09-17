-- Fix database issues for orders and clients relationship

-- 1. First, let's check and fix the orders table structure
-- Ensure the orders table has the correct foreign key to users (which are clients)
-- The relationship should be: orders.user_id -> auth.users.id (which are also in clients table)

-- Add foreign key constraint if it doesn't exist (this will help with the relationship)
DO $$ 
BEGIN
    -- Check if the foreign key constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_user_id_fkey' 
        AND table_name = 'orders'
    ) THEN
        -- Add the foreign key constraint
        ALTER TABLE "orders" 
        ADD CONSTRAINT "orders_user_id_fkey" 
        FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Fix the status check constraint
-- First, drop the existing constraint if it exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_status_check' 
        AND table_name = 'orders'
    ) THEN
        ALTER TABLE "orders" DROP CONSTRAINT "orders_status_check";
    END IF;
END $$;

-- Add the correct status check constraint with all valid statuses
ALTER TABLE "orders" 
ADD CONSTRAINT "orders_status_check" 
CHECK (status IN ('Open', 'In Process', 'Done', 'Cancelled'));

-- 3. Create a view to help with the orders-clients relationship for admin queries
-- This will make the relationship clearer and easier to query
CREATE OR REPLACE VIEW "orders_with_client_info" AS
SELECT 
    o.*,
    c.name as client_name,
    c.email as client_email,
    comp.company_name,
    comp.netsuite_number
FROM "orders" o
LEFT JOIN "clients" c ON c.id = o.user_id
LEFT JOIN "companies" comp ON comp.id = o.company_id;

-- Grant permissions on the view
GRANT SELECT ON "orders_with_client_info" TO authenticated;

-- 4. Create RLS policy for the view
ALTER VIEW "orders_with_client_info" OWNER TO postgres;

-- Create RLS policies for the view (if supported)
-- Note: RLS on views requires the underlying tables to have proper RLS

-- 5. Add indexes to improve query performance
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON "orders"("user_id");
CREATE INDEX IF NOT EXISTS idx_orders_company_id ON "orders"("company_id");
CREATE INDEX IF NOT EXISTS idx_orders_status ON "orders"("status");

-- 6. Add comments for documentation
COMMENT ON CONSTRAINT "orders_user_id_fkey" ON "orders" IS 'Foreign key to auth.users table (clients)';
COMMENT ON CONSTRAINT "orders_status_check" ON "orders" IS 'Valid order statuses: Open, In Process, Done, Cancelled';
COMMENT ON VIEW "orders_with_client_info" IS 'View combining orders with client and company information for admin queries';

-- 7. Refresh the schema cache (this helps with Supabase relationship detection)
-- This is done automatically by Supabase when we modify the schema
