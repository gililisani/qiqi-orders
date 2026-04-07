-- Simplify client DAM entitlement rules per product decision:
-- - Remove region restrictions (all assets available to all clients)
-- - Treat locales as languages only (no country/market gating)
-- - Remove audience restrictions (irrelevant)
-- - Preserve archived exclusion
--
-- This updates list_client_dam_assets_entitled to stop referencing:
-- - company_territories / companies.ship_to_country
-- - dam_asset_region_map for entitlement checks
-- - company_dam_audiences / dam_asset_audience_map entitlement checks
--
-- Locale/region parameters remain supported as *UI filters* (optional) using the mapping tables.

CREATE OR REPLACE FUNCTION list_client_dam_assets_entitled(
  p_user_id uuid,
  p_q text DEFAULT '',
  p_type text DEFAULT '',
  p_asset_type_id uuid DEFAULT NULL,
  p_asset_subtype_id uuid DEFAULT NULL,
  p_product_line text DEFAULT '',
  p_product_name text DEFAULT '',
  p_locale_code text DEFAULT '',
  p_region_code text DEFAULT '',
  p_tag text DEFAULT '',
  p_page int DEFAULT 1,
  p_limit int DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_offset int;
  v_asset_type_slug text;
BEGIN
  v_offset := GREATEST(0, (GREATEST(1, COALESCE(p_page, 1)) - 1) * GREATEST(1, COALESCE(p_limit, 50)));

  SELECT c.company_id
    INTO v_company_id
  FROM clients c
  WHERE c.id = p_user_id
    AND c.enabled = true
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('assets', '[]'::jsonb, 'total', 0);
  END IF;

  -- Resolve asset type slug so UUID-based UI filters also match legacy rows that only have `asset_type`.
  v_asset_type_slug := NULL;
  IF p_asset_type_id IS NOT NULL THEN
    SELECT t.slug
      INTO v_asset_type_slug
    FROM dam_asset_types t
    WHERE t.id = p_asset_type_id
    LIMIT 1;
  END IF;

  RETURN (
    WITH base AS (
      SELECT
        a.id,
        a.title,
        a.description,
        a.asset_type,
        a.asset_type_id,
        a.asset_subtype_id,
        a.product_line,
        a.product_name,
        a.sku,
        a.vimeo_video_id,
        a.vimeo_download_1080p,
        a.vimeo_download_720p,
        a.vimeo_download_480p,
        a.vimeo_download_360p,
        a.created_at,
        a.search_tags
      FROM dam_assets a
      WHERE a.is_archived = false
        AND (COALESCE(p_type, '') = '' OR a.asset_type::text = p_type)
        AND (
          p_asset_type_id IS NULL
          OR a.asset_type_id = p_asset_type_id
          OR (COALESCE(v_asset_type_slug, '') <> '' AND a.asset_type::text = v_asset_type_slug)
        )
        AND (p_asset_subtype_id IS NULL OR a.asset_subtype_id = p_asset_subtype_id)
        AND (COALESCE(p_product_line, '') = '' OR a.product_line ILIKE ('%' || p_product_line || '%'))
        AND (COALESCE(p_product_name, '') = '' OR a.product_name ILIKE ('%' || p_product_name || '%'))
        AND (
          COALESCE(p_q, '') = '' OR
          a.title ILIKE ('%' || p_q || '%') OR
          a.description ILIKE ('%' || p_q || '%') OR
          a.product_line ILIKE ('%' || p_q || '%') OR
          a.product_name ILIKE ('%' || p_q || '%') OR
          a.sku ILIKE ('%' || p_q || '%')
        )
        -- Optional UI filters (applied here so pagination remains correct)
        AND (
          COALESCE(p_locale_code, '') = '' OR EXISTS (
            SELECT 1
            FROM dam_asset_locale_map alm
            WHERE alm.asset_id = a.id AND alm.locale_code = p_locale_code
          )
        )
        AND (
          COALESCE(p_region_code, '') = '' OR EXISTS (
            SELECT 1
            FROM dam_asset_region_map arm
            WHERE arm.asset_id = a.id AND arm.region_code = p_region_code
          )
        )
        AND (
          COALESCE(p_tag, '') = '' OR EXISTS (
            SELECT 1
            FROM dam_asset_tag_map atm
            JOIN dam_tags dt ON dt.id = atm.tag_id
            WHERE atm.asset_id = a.id AND dt.label ILIKE ('%' || p_tag || '%')
          )
        )
    ),
    latest_version AS (
      SELECT DISTINCT ON (v.asset_id)
        v.asset_id,
        v.id,
        v.version_number,
        v.storage_path,
        v.thumbnail_path,
        v.mime_type,
        v.file_size,
        v.processing_status,
        v.created_at,
        v.duration_seconds,
        v.width,
        v.height,
        v.extracted_text
      FROM dam_asset_versions v
      JOIN base b ON b.id = v.asset_id
      ORDER BY v.asset_id, v.version_number DESC
    ),
    rows AS (
      SELECT
        b.*,
        jsonb_build_object(
          'id', lv.id,
          'version_number', lv.version_number,
          'storage_path', lv.storage_path,
          'thumbnail_path', lv.thumbnail_path,
          'mime_type', lv.mime_type,
          'file_size', lv.file_size,
          'processing_status', COALESCE(lv.processing_status, 'complete'),
          'created_at', lv.created_at,
          'duration_seconds', lv.duration_seconds,
          'width', lv.width,
          'height', lv.height,
          'extracted_text', lv.extracted_text
        ) AS current_version,
        COUNT(*) OVER() AS total_count
      FROM base b
      LEFT JOIN latest_version lv ON lv.asset_id = b.id
      ORDER BY b.created_at DESC
      OFFSET v_offset
      LIMIT GREATEST(1, COALESCE(p_limit, 50))
    )
    SELECT jsonb_build_object(
      'assets', COALESCE(jsonb_agg(to_jsonb(rows) - 'total_count'), '[]'::jsonb),
      'total', COALESCE(MAX(rows.total_count), 0)
    )
    FROM rows
  );
END;
$$;

REVOKE ALL ON FUNCTION list_client_dam_assets_entitled(uuid, text, text, uuid, uuid, text, text, text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_client_dam_assets_entitled(uuid, text, text, uuid, uuid, text, text, text, text, text, int, int) TO service_role;

