-- --------------------------------------------------
-- Storage policies for dam-assets bucket
-- --------------------------------------------------

-- IMPORTANT: RLS is ALREADY ENABLED on storage.objects by default in Supabase
-- You cannot manually enable it (it's a system table owned by Supabase)
-- You can verify RLS is enabled with: 
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'objects' AND schemaname = 'storage';
-- This migration only creates the policies (RLS must already be enabled)

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS dam_assets_storage_upload ON storage.objects;
DROP POLICY IF EXISTS dam_assets_storage_read ON storage.objects;
DROP POLICY IF EXISTS dam_assets_storage_update ON storage.objects;
DROP POLICY IF EXISTS dam_assets_storage_delete ON storage.objects;

-- Allow admins to upload files
-- Note: Storage policies use both USING and WITH CHECK for different operations
CREATE POLICY dam_assets_storage_upload ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'dam-assets' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1
      FROM admins
      WHERE id = auth.uid()
        AND enabled = true
    )
  );

-- Allow admins to read files
CREATE POLICY dam_assets_storage_read ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'dam-assets' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1
      FROM admins
      WHERE id = auth.uid()
        AND enabled = true
    )
  );

-- Allow admins to update files
CREATE POLICY dam_assets_storage_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'dam-assets' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1
      FROM admins
      WHERE id = auth.uid()
        AND enabled = true
    )
  )
  WITH CHECK (
    bucket_id = 'dam-assets' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1
      FROM admins
      WHERE id = auth.uid()
        AND enabled = true
    )
  );

-- Allow admins to delete files
CREATE POLICY dam_assets_storage_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'dam-assets' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1
      FROM admins
      WHERE id = auth.uid()
        AND enabled = true
    )
  );

