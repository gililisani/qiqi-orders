-- Create storage bucket for company note attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-notes', 'company-notes', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for company note attachments
-- Allow authenticated admins to upload note attachments
CREATE POLICY "Admins can upload company note attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-notes' AND
  EXISTS (
    SELECT 1 FROM admins WHERE admins.id = auth.uid()
  )
);

-- Allow authenticated users to view note attachments
CREATE POLICY "Authenticated users can view company note attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'company-notes');

-- Allow admins to delete note attachments
CREATE POLICY "Admins can delete company note attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-notes' AND
  EXISTS (
    SELECT 1 FROM admins WHERE admins.id = auth.uid()
  )
);

-- Allow admins to update note attachments
CREATE POLICY "Admins can update company note attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-notes' AND
  EXISTS (
    SELECT 1 FROM admins WHERE admins.id = auth.uid()
  )
);
