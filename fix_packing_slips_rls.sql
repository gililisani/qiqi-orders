-- Fix packing_slips RLS policies and enable RLS
-- This fixes the security issue where RLS was disabled and policies were incorrect

-- Step 1: Drop the broken client policy
DROP POLICY IF EXISTS "Clients can access their packing slips" ON packing_slips;

-- Step 2: Recreate the client policy with correct company-based logic
CREATE POLICY "Clients can access their packing slips"
  ON packing_slips
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM orders
      JOIN clients ON (orders.company_id = clients.company_id)
      WHERE orders.id = packing_slips.order_id 
        AND clients.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM orders
      JOIN clients ON (orders.company_id = clients.company_id)
      WHERE orders.id = packing_slips.order_id 
        AND clients.id = auth.uid()
    )
  );

-- Step 3: Enable RLS on packing_slips table
ALTER TABLE packing_slips ENABLE ROW LEVEL SECURITY;

-- Verification query (optional - run after migration to verify)
-- SELECT 
--   schemaname, 
--   tablename, 
--   rowsecurity 
-- FROM pg_tables 
-- WHERE tablename = 'packing_slips';

