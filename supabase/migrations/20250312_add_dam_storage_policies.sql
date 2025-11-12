-- --------------------------------------------------
-- Storage policies for dam-assets bucket
-- --------------------------------------------------

-- Allow admins to upload files
CREATE POLICY dam_assets_storage_upload ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'dam-assets' AND
    is_admin()
  );

-- Allow admins to read files
CREATE POLICY dam_assets_storage_read ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'dam-assets' AND
    is_admin()
  );

-- Allow admins to update files
CREATE POLICY dam_assets_storage_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'dam-assets' AND
    is_admin()
  );

-- Allow admins to delete files
CREATE POLICY dam_assets_storage_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'dam-assets' AND
    is_admin()
  );

