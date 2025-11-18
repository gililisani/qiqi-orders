-- --------------------------------------------------
-- Add dynamic Vimeo download formats support
-- --------------------------------------------------

-- Add JSON column to store dynamic download formats
-- Format: [{"resolution": "4K", "url": "https://..."}, {"resolution": "1080p", "url": "https://..."}]
ALTER TABLE dam_assets
  ADD COLUMN IF NOT EXISTS vimeo_download_formats JSONB DEFAULT '[]'::JSONB;

-- Migrate existing fixed columns to JSON format
UPDATE dam_assets
SET vimeo_download_formats = (
  SELECT jsonb_agg(
    jsonb_build_object('resolution', resolution, 'url', url)
    ORDER BY 
      CASE resolution
        WHEN '1080p' THEN 1
        WHEN '720p' THEN 2
        WHEN '480p' THEN 3
        WHEN '360p' THEN 4
        ELSE 5
      END
  )
  FROM (
    SELECT '1080p' as resolution, vimeo_download_1080p as url WHERE vimeo_download_1080p IS NOT NULL AND vimeo_download_1080p != ''
    UNION ALL
    SELECT '720p' as resolution, vimeo_download_720p as url WHERE vimeo_download_720p IS NOT NULL AND vimeo_download_720p != ''
    UNION ALL
    SELECT '480p' as resolution, vimeo_download_480p as url WHERE vimeo_download_480p IS NOT NULL AND vimeo_download_480p != ''
    UNION ALL
    SELECT '360p' as resolution, vimeo_download_360p as url WHERE vimeo_download_360p IS NOT NULL AND vimeo_download_360p != ''
  ) formats
  WHERE url IS NOT NULL AND url != ''
)
WHERE (vimeo_download_1080p IS NOT NULL AND vimeo_download_1080p != '')
   OR (vimeo_download_720p IS NOT NULL AND vimeo_download_720p != '')
   OR (vimeo_download_480p IS NOT NULL AND vimeo_download_480p != '')
   OR (vimeo_download_360p IS NOT NULL AND vimeo_download_360p != '');

-- Set empty array for assets with no download formats
UPDATE dam_assets
SET vimeo_download_formats = '[]'::JSONB
WHERE vimeo_download_formats IS NULL;

-- Create index for JSON queries
CREATE INDEX IF NOT EXISTS idx_dam_assets_vimeo_download_formats ON dam_assets USING GIN (vimeo_download_formats);

