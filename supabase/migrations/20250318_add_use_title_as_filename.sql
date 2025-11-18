-- Add use_title_as_filename column to dam_assets
-- This flag determines whether to use the asset title as the download filename
-- or keep the original uploaded filename

ALTER TABLE dam_assets
  ADD COLUMN IF NOT EXISTS use_title_as_filename BOOLEAN DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN dam_assets.use_title_as_filename IS 'If true, use asset title as download filename. If false, use original uploaded filename.';

