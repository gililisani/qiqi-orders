-- Fix packing slip RLS policies to allow both admins and clients to create packing slips

-- Drop existing policies first
DROP POLICY IF EXISTS "Admins can view all packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Clients can view their own packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Admins can create packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Admins can update packing slips" ON packing_slips;

-- Create comprehensive policies for packing_slips table

-- Policy for admins to view all packing slips
CREATE POLICY "Admins can view all packing slips" ON packing_slips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- Policy for clients to view their own packing slips
CREATE POLICY "Clients can view their own packing slips" ON packing_slips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders 
      JOIN clients ON orders.user_id = clients.id
      WHERE orders.id = packing_slips.order_id 
      AND clients.id = auth.uid()
    )
  );

-- Policy for admins to create packing slips
CREATE POLICY "Admins can create packing slips" ON packing_slips
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- Policy for clients to create packing slips for their own orders
CREATE POLICY "Clients can create packing slips for their orders" ON packing_slips
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders 
      JOIN clients ON orders.user_id = clients.id
      WHERE orders.id = packing_slips.order_id 
      AND clients.id = auth.uid()
    )
  );

-- Policy for admins to update all packing slips
CREATE POLICY "Admins can update all packing slips" ON packing_slips
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- Policy for clients to update their own packing slips
CREATE POLICY "Clients can update their own packing slips" ON packing_slips
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM orders 
      JOIN clients ON orders.user_id = clients.id
      WHERE orders.id = packing_slips.order_id 
      AND clients.id = auth.uid()
    )
  );
