-- --------------------------------------------------
-- Add Asset Taxonomy System (Types, Sub-Types, Product Fields)
-- --------------------------------------------------

-- 1. Create dam_asset_types table
CREATE TABLE IF NOT EXISTS dam_asset_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create dam_asset_subtypes table
CREATE TABLE IF NOT EXISTS dam_asset_subtypes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  asset_type_id UUID NOT NULL REFERENCES dam_asset_types(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dam_asset_subtypes_unique_per_type UNIQUE (asset_type_id, slug)
);

-- 3. Add new columns to dam_assets
ALTER TABLE dam_assets
  ADD COLUMN IF NOT EXISTS asset_type_id UUID REFERENCES dam_asset_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS asset_subtype_id UUID REFERENCES dam_asset_subtypes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_name TEXT;

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_dam_assets_asset_type_id ON dam_assets(asset_type_id);
CREATE INDEX IF NOT EXISTS idx_dam_assets_asset_subtype_id ON dam_assets(asset_subtype_id);
CREATE INDEX IF NOT EXISTS idx_dam_assets_product_name ON dam_assets(product_name);
CREATE INDEX IF NOT EXISTS idx_dam_asset_subtypes_asset_type_id ON dam_asset_subtypes(asset_type_id);

-- 5. Insert Asset Types
INSERT INTO dam_asset_types (name, slug, display_order) VALUES
  ('Image', 'image', 1),
  ('Video', 'video', 2),
  ('Document', 'document', 3),
  ('Artwork', 'artwork', 4),
  ('Audio', 'audio', 5),
  ('Packaging & Regulatory', 'packaging-regulatory', 6),
  ('Campaign', 'campaign', 7)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    display_order = EXCLUDED.display_order;

-- 6. Insert Asset Sub-Types
-- Get type IDs for reference
DO $$
DECLARE
  v_image_id UUID;
  v_video_id UUID;
  v_document_id UUID;
  v_artwork_id UUID;
  v_audio_id UUID;
  v_packaging_id UUID;
  v_campaign_id UUID;
BEGIN
  SELECT id INTO v_image_id FROM dam_asset_types WHERE slug = 'image';
  SELECT id INTO v_video_id FROM dam_asset_types WHERE slug = 'video';
  SELECT id INTO v_document_id FROM dam_asset_types WHERE slug = 'document';
  SELECT id INTO v_artwork_id FROM dam_asset_types WHERE slug = 'artwork';
  SELECT id INTO v_audio_id FROM dam_asset_types WHERE slug = 'audio';
  SELECT id INTO v_packaging_id FROM dam_asset_types WHERE slug = 'packaging-regulatory';
  SELECT id INTO v_campaign_id FROM dam_asset_types WHERE slug = 'campaign';

  -- Image Sub-Types
  INSERT INTO dam_asset_subtypes (name, slug, asset_type_id, display_order) VALUES
    ('Product Packshot', 'product-packshot', v_image_id, 1),
    ('Product Group Shot', 'product-group-shot', v_image_id, 2),
    ('Lifestyle', 'lifestyle', v_image_id, 3),
    ('Before & After', 'before-after', v_image_id, 4),
    ('Packaging Render', 'packaging-render', v_image_id, 5),
    ('Social Image', 'social-image', v_image_id, 6),
    ('Campaign KV', 'campaign-kv', v_image_id, 7),
    ('Branding / Logo Image', 'branding-logo-image', v_image_id, 8)
  ON CONFLICT (asset_type_id, slug) DO UPDATE
  SET name = EXCLUDED.name,
      display_order = EXCLUDED.display_order;

  -- Video Sub-Types
  INSERT INTO dam_asset_subtypes (name, slug, asset_type_id, display_order) VALUES
    ('Product Video', 'product-video', v_video_id, 1),
    ('Tutorial / How-To', 'tutorial-how-to', v_video_id, 2),
    ('General Brand Video', 'general-brand-video', v_video_id, 3),
    ('UGC', 'ugc', v_video_id, 4),
    ('Campaign Video', 'campaign-video', v_video_id, 5),
    ('Education Video', 'education-video', v_video_id, 6),
    ('Social Cutdown (TikTok/Reels)', 'social-cutdown', v_video_id, 7)
  ON CONFLICT (asset_type_id, slug) DO UPDATE
  SET name = EXCLUDED.name,
      display_order = EXCLUDED.display_order;

  -- Document Sub-Types
  INSERT INTO dam_asset_subtypes (name, slug, asset_type_id, display_order) VALUES
    ('Brand Deck', 'brand-deck', v_document_id, 1),
    ('Marketing Guidelines', 'marketing-guidelines', v_document_id, 2),
    ('Campaign Deck', 'campaign-deck', v_document_id, 3),
    ('Product Deck', 'product-deck', v_document_id, 4),
    ('Brochure', 'brochure', v_document_id, 5),
    ('Professional Education PDF', 'professional-education-pdf', v_document_id, 6),
    ('Training Manual', 'training-manual', v_document_id, 7),
    ('Product Catalog', 'product-catalog', v_document_id, 8)
  ON CONFLICT (asset_type_id, slug) DO UPDATE
  SET name = EXCLUDED.name,
      display_order = EXCLUDED.display_order;

  -- Artwork Sub-Types
  INSERT INTO dam_asset_subtypes (name, slug, asset_type_id, display_order) VALUES
    ('Logo Files', 'logo-files', v_artwork_id, 1),
    ('Fonts', 'fonts', v_artwork_id, 2),
    ('Packaging Templates', 'packaging-templates', v_artwork_id, 3),
    ('Design Templates (PSD/AI)', 'design-templates', v_artwork_id, 4),
    ('Social Templates', 'social-templates', v_artwork_id, 5),
    ('Print-Ready Artwork', 'print-ready-artwork', v_artwork_id, 6)
  ON CONFLICT (asset_type_id, slug) DO UPDATE
  SET name = EXCLUDED.name,
      display_order = EXCLUDED.display_order;

  -- Audio Sub-Types
  INSERT INTO dam_asset_subtypes (name, slug, asset_type_id, display_order) VALUES
    ('Music Track', 'music-track', v_audio_id, 1),
    ('SFX', 'sfx', v_audio_id, 2),
    ('Voiceover', 'voiceover', v_audio_id, 3),
    ('Social Audio Kit', 'social-audio-kit', v_audio_id, 4)
  ON CONFLICT (asset_type_id, slug) DO UPDATE
  SET name = EXCLUDED.name,
      display_order = EXCLUDED.display_order;

  -- Packaging & Regulatory Sub-Types
  INSERT INTO dam_asset_subtypes (name, slug, asset_type_id, display_order) VALUES
    ('Front Label', 'front-label', v_packaging_id, 1),
    ('Back Label', 'back-label', v_packaging_id, 2),
    ('Ingredients List', 'ingredients-list', v_packaging_id, 3),
    ('Safety Data Sheet / SDS', 'safety-data-sheet', v_packaging_id, 4),
    ('How-To-Use Sheet', 'how-to-use-sheet', v_packaging_id, 5),
    ('Regulatory Region PDF', 'regulatory-region-pdf', v_packaging_id, 6)
  ON CONFLICT (asset_type_id, slug) DO UPDATE
  SET name = EXCLUDED.name,
      display_order = EXCLUDED.display_order;

  -- Campaign Sub-Types
  INSERT INTO dam_asset_subtypes (name, slug, asset_type_id, display_order) VALUES
    ('Campaign Asset', 'campaign-asset', v_campaign_id, 1),
    ('Social Kit', 'social-kit', v_campaign_id, 2),
    ('Key Visual', 'key-visual', v_campaign_id, 3),
    ('Campaign Calendar', 'campaign-calendar', v_campaign_id, 4),
    ('Launch Timing Doc', 'launch-timing-doc', v_campaign_id, 5)
  ON CONFLICT (asset_type_id, slug) DO UPDATE
  SET name = EXCLUDED.name,
      display_order = EXCLUDED.display_order;
END $$;

-- 7. Map existing assets to new asset_type_id based on current asset_type enum
UPDATE dam_assets
SET asset_type_id = (
  SELECT id FROM dam_asset_types
  WHERE CASE
    WHEN dam_assets.asset_type::text = 'image' THEN slug = 'image'
    WHEN dam_assets.asset_type::text = 'video' THEN slug = 'video'
    WHEN dam_assets.asset_type::text = 'document' THEN slug = 'document'
    WHEN dam_assets.asset_type::text = 'audio' THEN slug = 'audio'
    WHEN dam_assets.asset_type::text = 'archive' THEN slug = 'document' -- Map archive to document
    WHEN dam_assets.asset_type::text = 'other' THEN slug = 'document' -- Map other to document
    ELSE FALSE
  END
)
WHERE asset_type_id IS NULL;

-- 8. RLS Policies for new tables
ALTER TABLE dam_asset_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_asset_subtypes ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY dam_asset_types_admin_full ON dam_asset_types
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY dam_asset_subtypes_admin_full ON dam_asset_subtypes
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Read access for authenticated users
CREATE POLICY dam_asset_types_read_authenticated ON dam_asset_types
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND active = TRUE);

CREATE POLICY dam_asset_subtypes_read_authenticated ON dam_asset_subtypes
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND active = TRUE);

