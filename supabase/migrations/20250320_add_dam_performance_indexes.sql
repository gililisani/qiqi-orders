-- Performance indexes for DAM assets queries
-- These indexes improve query performance for common filter and search operations

-- Index on asset_type for filtering by type
CREATE INDEX IF NOT EXISTS idx_dam_assets_asset_type ON public.dam_assets(asset_type);

-- Index on asset_type_id for filtering by taxonomy type
CREATE INDEX IF NOT EXISTS idx_dam_assets_asset_type_id ON public.dam_assets(asset_type_id);

-- Index on asset_subtype_id for filtering by subtype
CREATE INDEX IF NOT EXISTS idx_dam_assets_asset_subtype_id ON public.dam_assets(asset_subtype_id);

-- Index on created_at for date range filtering and sorting
CREATE INDEX IF NOT EXISTS idx_dam_assets_created_at ON public.dam_assets(created_at DESC);

-- Index on product_line for filtering by product line
CREATE INDEX IF NOT EXISTS idx_dam_assets_product_line ON public.dam_assets(product_line);

-- Index on product_name for filtering by product
CREATE INDEX IF NOT EXISTS idx_dam_assets_product_name ON public.dam_assets(product_name);

-- Index on sku for searching by SKU
CREATE INDEX IF NOT EXISTS idx_dam_assets_sku ON public.dam_assets(sku);

-- Index on vimeo_video_id for video assets
CREATE INDEX IF NOT EXISTS idx_dam_assets_vimeo_video_id ON public.dam_assets(vimeo_video_id) WHERE vimeo_video_id IS NOT NULL;

-- Index on is_archived for filtering active assets
CREATE INDEX IF NOT EXISTS idx_dam_assets_is_archived ON public.dam_assets(is_archived) WHERE is_archived = false;

-- Composite index for common filter combinations (type + created_at)
CREATE INDEX IF NOT EXISTS idx_dam_assets_type_created_at ON public.dam_assets(asset_type_id, created_at DESC);

-- Index on asset_versions for faster version lookups
CREATE INDEX IF NOT EXISTS idx_dam_asset_versions_asset_id ON public.dam_asset_versions(asset_id);

-- Index on asset_versions for finding latest version
CREATE INDEX IF NOT EXISTS idx_dam_asset_versions_asset_version ON public.dam_asset_versions(asset_id, version_number DESC);

-- Index on thumbnail_path for checking thumbnail availability
CREATE INDEX IF NOT EXISTS idx_dam_asset_versions_thumbnail_path ON public.dam_asset_versions(thumbnail_path) WHERE thumbnail_path IS NOT NULL;

-- Index on asset_locale_map for locale filtering
CREATE INDEX IF NOT EXISTS idx_dam_asset_locale_map_asset_id ON public.dam_asset_locale_map(asset_id);
CREATE INDEX IF NOT EXISTS idx_dam_asset_locale_map_locale_code ON public.dam_asset_locale_map(locale_code);

-- Index on asset_region_map for region filtering
CREATE INDEX IF NOT EXISTS idx_dam_asset_region_map_asset_id ON public.dam_asset_region_map(asset_id);
CREATE INDEX IF NOT EXISTS idx_dam_asset_region_map_region_code ON public.dam_asset_region_map(region_code);

-- Index on asset_tag_map for tag filtering
CREATE INDEX IF NOT EXISTS idx_dam_asset_tag_map_asset_id ON public.dam_asset_tag_map(asset_id);
CREATE INDEX IF NOT EXISTS idx_dam_asset_tag_map_tag_id ON public.dam_asset_tag_map(tag_id);

-- Index on campaigns for campaign filtering
CREATE INDEX IF NOT EXISTS idx_campaign_assets_asset_id ON public.campaign_assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_campaign_assets_campaign_id ON public.campaign_assets(campaign_id);

-- Full-text search index on title and description (if using PostgreSQL full-text search)
-- Note: This requires the pg_trgm extension for trigram matching
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_dam_assets_title_trgm ON public.dam_assets USING gin(title gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_dam_assets_description_trgm ON public.dam_assets USING gin(description gin_trgm_ops);

