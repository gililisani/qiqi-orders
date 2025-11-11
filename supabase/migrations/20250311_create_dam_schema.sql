-- --------------------------------------------------
-- Digital Asset Manager (DAM) schema bootstrap
-- --------------------------------------------------

-- Requirements
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------
-- Helper functions
-- --------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admins a
    WHERE a.id = auth.uid()
  );
$$;

-- --------------------------------------------------
-- Enumerations
-- --------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dam_asset_type') THEN
    CREATE TYPE dam_asset_type AS ENUM (
      'image',
      'video',
      'document',
      'audio',
      'archive',
      'other'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dam_processing_status') THEN
    CREATE TYPE dam_processing_status AS ENUM (
      'pending',
      'processing',
      'complete',
      'failed'
    );
  END IF;
END
$$;

-- --------------------------------------------------
-- Core tables
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS dam_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  asset_type dam_asset_type NOT NULL,
  product_line TEXT,
  sku TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_version_id UUID,
  search_tags TEXT[] DEFAULT ARRAY[]::TEXT[]
);

CREATE TABLE IF NOT EXISTS dam_asset_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID NOT NULL REFERENCES dam_assets(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'dam-assets',
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  checksum TEXT,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds NUMERIC,
  page_count INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  preview_path TEXT,
  thumbnail_path TEXT,
  extracted_text TEXT,
  search_vector TSVECTOR,
  processing_status dam_processing_status NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dam_asset_versions_version_unique UNIQUE (asset_id, version_number)
);

ALTER TABLE dam_assets
  ADD CONSTRAINT dam_assets_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES dam_asset_versions(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- --------------------------------------------------
-- Dictionary tables
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS dam_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dam_audiences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dam_locales (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dam_regions (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------
-- Association tables
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS dam_asset_tag_map (
  asset_id UUID REFERENCES dam_assets(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES dam_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, tag_id)
);

CREATE TABLE IF NOT EXISTS dam_asset_audience_map (
  asset_id UUID REFERENCES dam_assets(id) ON DELETE CASCADE,
  audience_id UUID REFERENCES dam_audiences(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, audience_id)
);

CREATE TABLE IF NOT EXISTS dam_asset_locale_map (
  asset_id UUID REFERENCES dam_assets(id) ON DELETE CASCADE,
  locale_code TEXT REFERENCES dam_locales(code) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (asset_id, locale_code)
);

CREATE TABLE IF NOT EXISTS dam_asset_region_map (
  asset_id UUID REFERENCES dam_assets(id) ON DELETE CASCADE,
  region_code TEXT REFERENCES dam_regions(code) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, region_code)
);

-- --------------------------------------------------
-- Triggers & functions
-- --------------------------------------------------
CREATE OR REPLACE FUNCTION dam_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER dam_assets_touch_updated_at
  BEFORE UPDATE ON dam_assets
  FOR EACH ROW
  EXECUTE FUNCTION dam_touch_updated_at();

CREATE TRIGGER dam_asset_versions_touch_updated_at
  BEFORE UPDATE ON dam_asset_versions
  FOR EACH ROW
  EXECUTE FUNCTION dam_touch_updated_at();

CREATE OR REPLACE FUNCTION dam_update_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce((SELECT da.title FROM dam_assets da WHERE da.id = NEW.asset_id), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.extracted_text, '')), 'B');
  RETURN NEW;
END;
$$;

CREATE TRIGGER dam_asset_versions_update_search_vector
  BEFORE INSERT OR UPDATE ON dam_asset_versions
  FOR EACH ROW
  EXECUTE FUNCTION dam_update_search_vector();

CREATE OR REPLACE FUNCTION dam_set_current_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE dam_assets
  SET current_version_id = NEW.id,
      updated_at = now()
  WHERE id = NEW.asset_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER dam_asset_versions_set_current
  AFTER INSERT ON dam_asset_versions
  FOR EACH ROW
  EXECUTE FUNCTION dam_set_current_version();

-- --------------------------------------------------
-- Initial reference data
-- --------------------------------------------------
INSERT INTO dam_locales (code, label, is_default)
VALUES
  ('en-US', 'English (United States)', TRUE),
  ('en-GB', 'English (United Kingdom)', FALSE),
  ('es-MX', 'Spanish (Mexico)', FALSE)
ON CONFLICT (code) DO UPDATE
SET label = EXCLUDED.label,
    is_default = EXCLUDED.is_default;

INSERT INTO dam_audiences (code, label)
VALUES
  ('distributor', 'Distributor'),
  ('pro', 'Professional'),
  ('internal', 'Internal Staff')
ON CONFLICT (code) DO UPDATE
SET label = EXCLUDED.label;

-- --------------------------------------------------
-- Storage bucket setup (private)
-- --------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('dam-assets', 'dam-assets', FALSE)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------
-- Indexes
-- --------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dam_assets_type ON dam_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_dam_assets_created_at ON dam_assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dam_assets_product_line ON dam_assets(product_line);
CREATE INDEX IF NOT EXISTS idx_dam_asset_versions_asset_id ON dam_asset_versions(asset_id);
CREATE INDEX IF NOT EXISTS idx_dam_asset_versions_search ON dam_asset_versions USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_dam_asset_tag_map_tag_id ON dam_asset_tag_map(tag_id);
CREATE INDEX IF NOT EXISTS idx_dam_asset_audience_map_audience_id ON dam_asset_audience_map(audience_id);
CREATE INDEX IF NOT EXISTS idx_dam_asset_locale_map_locale ON dam_asset_locale_map(locale_code);
CREATE INDEX IF NOT EXISTS idx_dam_asset_region_map_region ON dam_asset_region_map(region_code);

-- --------------------------------------------------
-- Row Level Security
-- --------------------------------------------------
ALTER TABLE dam_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_asset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_asset_tag_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_asset_audience_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_asset_locale_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_asset_region_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_regions ENABLE ROW LEVEL SECURITY;

-- Admin full access policies
CREATE POLICY dam_assets_admin_full ON dam_assets
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY dam_asset_versions_admin_full ON dam_asset_versions
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY dam_tags_admin_full ON dam_tags
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY dam_audiences_admin_full ON dam_audiences
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY dam_locales_admin_full ON dam_locales
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY dam_regions_admin_full ON dam_regions
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY dam_asset_tag_map_admin_full ON dam_asset_tag_map
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY dam_asset_audience_map_admin_full ON dam_asset_audience_map
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY dam_asset_locale_map_admin_full ON dam_asset_locale_map
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY dam_asset_region_map_admin_full ON dam_asset_region_map
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Read policies for authenticated users
CREATE POLICY dam_assets_read_authenticated ON dam_assets
  FOR SELECT
  USING (NOT is_archived AND auth.uid() IS NOT NULL);

CREATE POLICY dam_asset_versions_read_authenticated ON dam_asset_versions
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM dam_assets da
      WHERE da.id = dam_asset_versions.asset_id
        AND NOT da.is_archived
    )
  );

CREATE POLICY dam_asset_tag_map_read_authenticated ON dam_asset_tag_map
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM dam_assets da
      WHERE da.id = dam_asset_tag_map.asset_id
        AND NOT da.is_archived
    )
  );

CREATE POLICY dam_asset_audience_map_read_authenticated ON dam_asset_audience_map
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM dam_assets da
      WHERE da.id = dam_asset_audience_map.asset_id
        AND NOT da.is_archived
    )
  );

CREATE POLICY dam_asset_locale_map_read_authenticated ON dam_asset_locale_map
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM dam_assets da
      WHERE da.id = dam_asset_locale_map.asset_id
        AND NOT da.is_archived
    )
  );

CREATE POLICY dam_asset_region_map_read_authenticated ON dam_asset_region_map
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM dam_assets da
      WHERE da.id = dam_asset_region_map.asset_id
        AND NOT da.is_archived
    )
  );

CREATE POLICY dam_tags_read_authenticated ON dam_tags
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY dam_audiences_read_authenticated ON dam_audiences
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY dam_locales_read_authenticated ON dam_locales
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY dam_regions_read_authenticated ON dam_regions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
