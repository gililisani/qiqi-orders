-- Setup Supabase Storage for category images

-- Create storage bucket for category images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'category-images',
  'category-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
);

-- Create RLS policies for category images bucket
CREATE POLICY "Public read access for category images" ON storage.objects
FOR SELECT USING (bucket_id = 'category-images');

CREATE POLICY "Admin write access for category images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'category-images' AND
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_user_meta_data->>'role' = 'admin'
  )
);

CREATE POLICY "Admin update access for category images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'category-images' AND
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_user_meta_data->>'role' = 'admin'
  )
);

CREATE POLICY "Admin delete access for category images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'category-images' AND
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_user_meta_data->>'role' = 'admin'
  )
);

-- Verify bucket creation
SELECT * FROM storage.buckets WHERE id = 'category-images';
