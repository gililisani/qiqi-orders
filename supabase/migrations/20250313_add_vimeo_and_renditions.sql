-- --------------------------------------------------
-- Add Vimeo support and asset renditions table
-- --------------------------------------------------

-- Add vimeo_video_id to dam_assets (for videos hosted on Vimeo)
ALTER TABLE dam_assets
  ADD COLUMN IF NOT EXISTS vimeo_video_id TEXT;

CREATE INDEX IF NOT EXISTS idx_dam_assets_vimeo_video_id ON dam_assets(vimeo_video_id) WHERE vimeo_video_id IS NOT NULL;

-- --------------------------------------------------
-- Asset renditions table (for PDF thumbnails, etc.)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS dam_asset_renditions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID NOT NULL REFERENCES dam_assets(id) ON DELETE CASCADE,
  version_id UUID REFERENCES dam_asset_versions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL, -- 'thumb', 'preview', 'web', etc.
  storage_bucket TEXT NOT NULL DEFAULT 'dam-assets',
  storage_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  file_size BIGINT,
  mime_type TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT dam_asset_renditions_unique_per_version_kind UNIQUE (version_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_dam_asset_renditions_asset_id ON dam_asset_renditions(asset_id);
CREATE INDEX IF NOT EXISTS idx_dam_asset_renditions_version_id ON dam_asset_renditions(version_id);
CREATE INDEX IF NOT EXISTS idx_dam_asset_renditions_kind ON dam_asset_renditions(kind);

-- --------------------------------------------------
-- RLS for asset renditions
-- --------------------------------------------------
ALTER TABLE dam_asset_renditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY dam_asset_renditions_admin_full ON dam_asset_renditions
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY dam_asset_renditions_read_authenticated ON dam_asset_renditions
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM dam_assets da
      WHERE da.id = dam_asset_renditions.asset_id
        AND NOT da.is_archived
    )
  );

-- --------------------------------------------------
-- Download events table (for tracking downloads)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS dam_download_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID NOT NULL REFERENCES dam_assets(id) ON DELETE CASCADE,
  version_id UUID REFERENCES dam_asset_versions(id) ON DELETE SET NULL,
  rendition_id UUID REFERENCES dam_asset_renditions(id) ON DELETE SET NULL,
  downloaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  download_method TEXT, -- 'api', 'vimeo', etc.
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dam_download_events_asset_id ON dam_download_events(asset_id);
CREATE INDEX IF NOT EXISTS idx_dam_download_events_downloaded_by ON dam_download_events(downloaded_by);
CREATE INDEX IF NOT EXISTS idx_dam_download_events_created_at ON dam_download_events(created_at DESC);

-- RLS for download events (admins can see all, users can see their own)
ALTER TABLE dam_download_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY dam_download_events_admin_full ON dam_download_events
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY dam_download_events_user_insert ON dam_download_events
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY dam_download_events_user_read_own ON dam_download_events
  FOR SELECT
  USING (auth.uid() = downloaded_by);

