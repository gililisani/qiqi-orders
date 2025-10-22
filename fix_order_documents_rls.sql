-- Fix RLS policies for order_documents table
-- Allow both admins and clients to view documents for orders they have access to

-- First, check if the table exists and has RLS enabled
DO $$
BEGIN
    -- Enable RLS on order_documents table
    ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'order_documents table does not exist yet';
END $$;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can manage order documents" ON order_documents;
DROP POLICY IF EXISTS "Clients can view order documents" ON order_documents;
DROP POLICY IF EXISTS "Users can view their order documents" ON order_documents;

-- Create new policies

-- Admins can do everything with order documents
CREATE POLICY "Admins can manage order documents"
  ON order_documents
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- Clients can view documents for orders from their company
CREATE POLICY "Clients can view order documents"
  ON order_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN orders o ON o.company_id = c.company_id
      WHERE c.id = auth.uid() 
      AND o.id = order_documents.order_id
    )
  );

-- Allow clients to upload documents for their company's orders
CREATE POLICY "Clients can upload order documents"
  ON order_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN orders o ON o.company_id = c.company_id
      WHERE c.id = auth.uid() 
      AND o.id = order_documents.order_id
    )
  );

-- Allow clients to update documents they uploaded
CREATE POLICY "Clients can update their documents"
  ON order_documents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN orders o ON o.company_id = c.company_id
      WHERE c.id = auth.uid() 
      AND o.id = order_documents.order_id
    )
  );

-- Allow clients to delete documents they uploaded
CREATE POLICY "Clients can delete their documents"
  ON order_documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN orders o ON o.company_id = c.company_id
      WHERE c.id = auth.uid() 
      AND o.id = order_documents.order_id
    )
  );
