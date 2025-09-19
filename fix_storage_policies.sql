-- Fix RLS policies for category images storage
-- Run this if you already created the bucket but policies are failing

-- Drop existing policies (if they exist)
DROP POLICY IF EXISTS "Admin write access for category images" ON storage.objects;
DROP POLICY IF EXISTS "Admin update access for category images" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete access for category images" ON storage.objects;

-- Create simplified policies that work with authenticated users
CREATE POLICY "Admin write access for category images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'category-images' AND
  auth.role() = 'authenticated'
);

CREATE POLICY "Admin update access for category images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'category-images' AND
  auth.role() = 'authenticated'
);

CREATE POLICY "Admin delete access for category images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'category-images' AND
  auth.role() = 'authenticated'
);

-- Verify policies are created
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%category images%';
