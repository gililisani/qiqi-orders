-- Setup Storage Bucket for Order Documents
-- Run this in your Supabase SQL Editor

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-documents',
  'order-documents', 
  false, -- Private bucket
  10485760, -- 10MB file size limit
  ARRAY['application/pdf'] -- Only PDF files allowed
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for the bucket

-- Policy: Admins can upload files
CREATE POLICY "Admins can upload order documents" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'order-documents' AND
  EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
);

-- Policy: Admins can view all files
CREATE POLICY "Admins can view order documents" ON storage.objects
FOR SELECT USING (
  bucket_id = 'order-documents' AND
  EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
);

-- Policy: Clients can view files for their orders
CREATE POLICY "Clients can view their order documents" ON storage.objects
FOR SELECT USING (
  bucket_id = 'order-documents' AND
  EXISTS (
    SELECT 1 FROM orders 
    JOIN clients ON orders.user_id = clients.id
    WHERE orders.id::text = (storage.foldername(name))[2] -- Extract order_id from path
    AND clients.id = auth.uid()
  )
);

-- Policy: Admins can delete files
CREATE POLICY "Admins can delete order documents" ON storage.objects
FOR DELETE USING (
  bucket_id = 'order-documents' AND
  EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
);

-- Verify bucket was created
SELECT 'Storage bucket setup complete:' as info;
SELECT id, name, public, file_size_limit, allowed_mime_types 
FROM storage.buckets 
WHERE id = 'order-documents';
