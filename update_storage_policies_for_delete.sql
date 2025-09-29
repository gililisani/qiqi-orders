-- Update Storage Policies to Allow Admin Document Deletion
-- Run this in your Supabase SQL Editor

-- Drop existing delete policy if it exists
DROP POLICY IF EXISTS "Admins can delete order documents" ON storage.objects;

-- Create new policy for admins to delete files
CREATE POLICY "Admins can delete order documents" ON storage.objects
FOR DELETE USING (
  bucket_id = 'order-documents' AND
  EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
);

-- Verify the policies
SELECT 'Storage policies updated for document deletion:' as info;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage'
AND policyname LIKE '%order%';
