-- Fix RLS policies for order_history table
-- Allow clients to insert history entries for their company's orders

-- Drop existing policies
DROP POLICY IF EXISTS "Clients can insert order history for their company" ON order_history;
DROP POLICY IF EXISTS "Clients can view their company's order history" ON order_history;

-- Recreate SELECT policy for clients
CREATE POLICY "Clients can view their company's order history"
  ON order_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN clients c ON c.company_id = o.company_id
      WHERE o.id = order_history.order_id
        AND c.id = auth.uid()
    )
  );

-- Recreate INSERT policy for clients - FIXED version
CREATE POLICY "Clients can insert order history for their company"
  ON order_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Check if the user is a client for the company that owns this order
    EXISTS (
      SELECT 1 FROM orders o
      JOIN clients c ON c.company_id = o.company_id
      WHERE o.id = order_history.order_id
        AND c.id = auth.uid()
    )
    OR
    -- OR if the user is an admin
    EXISTS (
      SELECT 1 FROM admins WHERE admins.id = auth.uid()
    )
  );

-- Verify policies are active
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'order_history'
ORDER BY policyname;

