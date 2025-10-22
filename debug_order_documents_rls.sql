-- Debug and fix order_documents RLS policies
-- This script will help identify and fix the issue

-- Step 1: Check if the table exists and RLS is enabled
DO $$
BEGIN
    -- Check if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_documents') THEN
        RAISE NOTICE 'order_documents table exists';
        
        -- Check if RLS is enabled
        IF EXISTS (
            SELECT 1 FROM pg_class 
            WHERE relname = 'order_documents' 
            AND relrowsecurity = true
        ) THEN
            RAISE NOTICE 'RLS is enabled on order_documents table';
        ELSE
            RAISE NOTICE 'RLS is NOT enabled on order_documents table - enabling now';
            ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;
        END IF;
    ELSE
        RAISE NOTICE 'order_documents table does not exist';
    END IF;
END $$;

-- Step 2: Drop all existing policies
DROP POLICY IF EXISTS "Admins can manage order documents" ON order_documents;
DROP POLICY IF EXISTS "Clients can view order documents" ON order_documents;
DROP POLICY IF EXISTS "Users can view their order documents" ON order_documents;
DROP POLICY IF EXISTS "Clients can upload order documents" ON order_documents;
DROP POLICY IF EXISTS "Clients can update their documents" ON order_documents;
DROP POLICY IF EXISTS "Clients can delete their documents" ON order_documents;
DROP POLICY IF EXISTS "Admins can manage all order documents" ON order_documents;
DROP POLICY IF EXISTS "Clients can view their company order documents" ON order_documents;
DROP POLICY IF EXISTS "Clients can upload to their company orders" ON order_documents;
DROP POLICY IF EXISTS "Clients can update their company order documents" ON order_documents;
DROP POLICY IF EXISTS "Clients can delete their company order documents" ON order_documents;

-- Step 3: Create new, simple policies

-- Policy for Admins: Full access
CREATE POLICY "admin_full_access"
  ON order_documents
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- Policy for Clients: View documents for their company's orders
CREATE POLICY "client_view_company_documents"
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

-- Policy for Clients: Upload documents for their company's orders
CREATE POLICY "client_upload_company_documents"
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

-- Policy for Clients: Update documents for their company's orders
CREATE POLICY "client_update_company_documents"
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

-- Policy for Clients: Delete documents for their company's orders
CREATE POLICY "client_delete_company_documents"
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

-- Step 4: Verify the policies were created
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'order_documents'
ORDER BY policyname;
