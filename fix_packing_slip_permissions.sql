-- Fix packing slip RLS policies to allow proper access
-- This script should be run in your Supabase SQL editor

-- First, drop all existing policies
DROP POLICY IF EXISTS "Users can view relevant packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Users can create packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Users can update relevant packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Admins can view all packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Clients can view their own packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Admins can create packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Clients can create packing slips for their orders" ON packing_slips;
DROP POLICY IF EXISTS "Admins can update all packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Clients can update their own packing slips" ON packing_slips;

-- Create simplified policies that should work

-- Policy 1: Allow admins to do everything
CREATE POLICY "Admins full access to packing slips" ON packing_slips
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  );

-- Policy 2: Allow clients to access packing slips for their orders
CREATE POLICY "Clients can access their packing slips" ON packing_slips
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM orders 
      JOIN clients ON orders.user_id = clients.id
      WHERE orders.id = packing_slips.order_id 
      AND clients.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders 
      JOIN clients ON orders.user_id = clients.id
      WHERE orders.id = packing_slips.order_id 
      AND clients.id = auth.uid()
    )
  );

-- Verify RLS is enabled
ALTER TABLE packing_slips ENABLE ROW LEVEL SECURITY;

-- Test queries (optional - you can run these to verify)
-- SELECT * FROM packing_slips LIMIT 1;
