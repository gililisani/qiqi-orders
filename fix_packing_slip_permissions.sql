-- Fix packing slip RLS policies to allow proper access
-- This script should be run in your Supabase SQL editor

-- Drop ALL existing policies (including the ones that already exist)
DROP POLICY IF EXISTS "Users can view relevant packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Users can create packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Users can update relevant packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Admins can view all packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Clients can view their own packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Admins can create packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Clients can create packing slips for their orders" ON packing_slips;
DROP POLICY IF EXISTS "Admins can update all packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Clients can update their own packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Admins full access to packing slips" ON packing_slips;
DROP POLICY IF EXISTS "Clients can access their packing slips" ON packing_slips;

-- Temporarily disable RLS to ensure clean slate
ALTER TABLE packing_slips DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS
ALTER TABLE packing_slips ENABLE ROW LEVEL SECURITY;

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

-- Test: Check if admin user exists in admins table
SELECT 'Admin user check:' as info, id, email FROM auth.users WHERE email = 'gili@qiqiglobal.com';
SELECT 'Admins table check:' as info, * FROM admins WHERE id = (SELECT id FROM auth.users WHERE email = 'gili@qiqiglobal.com');
