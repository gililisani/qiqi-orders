-- Simple fix for order_documents RLS policies
-- This should allow clients to see documents for their company's orders

-- First, ensure RLS is enabled
ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Admins can manage order documents" ON order_documents;
DROP POLICY IF EXISTS "Clients can view order documents" ON order_documents;
DROP POLICY IF EXISTS "Users can view their order documents" ON order_documents;
DROP POLICY IF EXISTS "Clients can upload order documents" ON order_documents;
DROP POLICY IF EXISTS "Clients can update their documents" ON order_documents;
DROP POLICY IF EXISTS "Clients can delete their documents" ON order_documents;

-- Create simple policies

-- Policy 1: Admins can do everything
CREATE POLICY "Admins can manage all order documents"
  ON order_documents
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- Policy 2: Clients can view documents for orders from their company
CREATE POLICY "Clients can view their company order documents"
  ON order_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM clients c
      JOIN orders o ON o.company_id = c.company_id
      WHERE c.id = auth.uid() 
      AND o.id = order_documents.order_id
    )
  );

-- Policy 3: Clients can upload documents for their company's orders
CREATE POLICY "Clients can upload to their company orders"
  ON order_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM clients c
      JOIN orders o ON o.company_id = c.company_id
      WHERE c.id = auth.uid() 
      AND o.id = order_documents.order_id
    )
  );

-- Policy 4: Clients can update documents for their company's orders
CREATE POLICY "Clients can update their company order documents"
  ON order_documents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM clients c
      JOIN orders o ON o.company_id = c.company_id
      WHERE c.id = auth.uid() 
      AND o.id = order_documents.order_id
    )
  );

-- Policy 5: Clients can delete documents for their company's orders
CREATE POLICY "Clients can delete their company order documents"
  ON order_documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM clients c
      JOIN orders o ON o.company_id = c.company_id
      WHERE c.id = auth.uid() 
      AND o.id = order_documents.order_id
    )
  );
