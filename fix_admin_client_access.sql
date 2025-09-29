-- Fix Admin Access to Client Data for Order Management
-- Run this in your Supabase SQL Editor

-- Check current RLS policies on clients table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'clients' 
AND schemaname = 'public';

-- Drop existing policies that might be blocking admin access
DROP POLICY IF EXISTS "Users can view own client data" ON clients;
DROP POLICY IF EXISTS "Admins can view all clients" ON clients;

-- Create new policies for clients table
-- Allow clients to view their own data
CREATE POLICY "Clients can view own data" ON clients
FOR SELECT USING (auth.uid() = id);

-- Allow admins to view all client data (needed for order management)
CREATE POLICY "Admins can view all clients" ON clients
FOR SELECT USING (
  EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
);

-- Verify the new policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'clients' 
AND schemaname = 'public'
ORDER BY policyname;
