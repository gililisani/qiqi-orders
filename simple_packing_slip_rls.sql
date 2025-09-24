-- Simple, permissive RLS policies for packing_slips table
-- This allows both admins and clients to create, read, and update packing slips

-- Drop all existing policies first
DROP POLICY IF EXISTS "Admins can view all packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Clients can view their own packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Admins can create packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Clients can create packing slips for their orders" ON packing_slips;
DROP POLICY IF EXISTS "Admins can update all packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Clients can update their own packing slips" ON packing_slips;

-- Allow authenticated users to view packing slips they created or for their orders
CREATE POLICY "Users can view relevant packing slips" ON packing_slips
  FOR SELECT USING (
    -- User created the packing slip
    created_by = auth.uid()
    OR
    -- User is an admin
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
    OR
    -- User is the client who owns the order
    EXISTS (
      SELECT 1 FROM orders 
      JOIN clients ON orders.user_id = clients.id
      WHERE orders.id = packing_slips.order_id 
      AND clients.id = auth.uid()
    )
  );

-- Allow authenticated users to create packing slips for orders they have access to
CREATE POLICY "Users can create packing slips" ON packing_slips
  FOR INSERT WITH CHECK (
    -- User is an admin
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
    OR
    -- User is the client who owns the order
    EXISTS (
      SELECT 1 FROM orders 
      JOIN clients ON orders.user_id = clients.id
      WHERE orders.id = packing_slips.order_id 
      AND clients.id = auth.uid()
    )
  );

-- Allow authenticated users to update packing slips they created or for their orders
CREATE POLICY "Users can update relevant packing slips" ON packing_slips
  FOR UPDATE USING (
    -- User created the packing slip
    created_by = auth.uid()
    OR
    -- User is an admin
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
    OR
    -- User is the client who owns the order
    EXISTS (
      SELECT 1 FROM orders 
      JOIN clients ON orders.user_id = clients.id
      WHERE orders.id = packing_slips.order_id 
      AND clients.id = auth.uid()
    )
  );
