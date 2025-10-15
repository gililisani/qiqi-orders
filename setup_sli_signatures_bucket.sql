-- Create storage bucket for SLI signatures
INSERT INTO storage.buckets (id, name, public)
VALUES ('sli-signatures', 'sli-signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for SLI signatures
-- Allow authenticated admins to upload signatures
CREATE POLICY "Admins can upload SLI signatures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sli-signatures' AND
  EXISTS (
    SELECT 1 FROM admins WHERE admins.id = auth.uid()
  )
);

-- Allow authenticated users to view signatures
CREATE POLICY "Authenticated users can view SLI signatures"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'sli-signatures');

-- Allow admins to delete signatures
CREATE POLICY "Admins can delete SLI signatures"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'sli-signatures' AND
  EXISTS (
    SELECT 1 FROM admins WHERE admins.id = auth.uid()
  )
);

