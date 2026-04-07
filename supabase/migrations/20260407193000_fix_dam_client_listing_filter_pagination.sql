-- Fix DAM client listing filter correctness.
--
-- Problem:
-- Many assets have `asset_type` populated (e.g. 'video') but may have NULL/legacy `asset_type_id`.
-- The client UI's "Asset Type" dropdown sends `dam_asset_types.id` (UUID) which previously filtered
-- only on `dam_assets.asset_type_id`, causing "Video" to return a sparse subset across pages.
--
-- Fix:
-- When `p_asset_type_id` is provided, also resolve its `slug` and match against `dam_assets.asset_type`.
-- This keeps filters applied BEFORE pagination and makes `total` reflect the filtered+entitled set.

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
  v_company_codes text[];
  v_company_has_audiences boolean;
  v_company_audience_ids uuid[];
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

  SELECT COALESCE(array_agg(DISTINCT upper(ct.country_code)), '{}'::text[])
    INTO v_company_codes
  FROM company_territories ct
  WHERE ct.company_id = v_company_id
    AND ct.country_code IS NOT NULL
    AND length(trim(ct.country_code)) = 2;

  -- Add ship_to_country as eligible geography (when set)
  v_company_codes := (
    SELECT COALESCE(
      array_agg(DISTINCT x.code),
      '{}'::text[]
    )
    FROM (
      SELECT unnest(v_company_codes) AS code
      UNION
      SELECT upper(trim(co.ship_to_country)) AS code
      FROM companies co
      WHERE co.id = v_company_id
        AND co.ship_to_country IS NOT NULL
        AND length(trim(co.ship_to_country)) = 2
    ) x
    WHERE x.code IS NOT NULL AND x.code <> ''
  );

  SELECT (COUNT(*) > 0)
    INTO v_company_has_audiences
  FROM company_dam_audiences cda
  WHERE cda.company_id = v_company_id;

  IF v_company_has_audiences THEN
    SELECT COALESCE(array_agg(DISTINCT cda.audience_id), '{}'::uuid[])
      INTO v_company_audience_ids
    FROM company_dam_audiences cda
    WHERE cda.company_id = v_company_id;
  ELSE
    v_company_audience_ids := '{}'::uuid[];
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
        AND (COALESCE(p_type, '') = '' OR a.asset_type = p_type)
        AND (
          p_asset_type_id IS NULL
          OR a.asset_type_id = p_asset_type_id
          OR (COALESCE(v_asset_type_slug, '') <> '' AND a.asset_type = v_asset_type_slug)
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
        -- Optional UI filters (must be applied here so pagination remains correct)
        AND (
          COALESCE(p_locale_code, '') = '' OR EXISTS (
            SELECT 1
            FROM dam_asset_locale_map alm
            JOIN dam_locales dl ON dl.id = alm.locale_id
            WHERE alm.asset_id = a.id AND dl.code = p_locale_code
          )
        )
        AND (
          COALESCE(p_region_code, '') = '' OR EXISTS (
            SELECT 1
            FROM dam_asset_region_map arm
            JOIN dam_regions dr ON dr.id = arm.region_id
            WHERE arm.asset_id = a.id AND dr.code = p_region_code
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
        -- Region entitlement: only restrict if asset has region rows
        AND (
          NOT EXISTS (SELECT 1 FROM dam_asset_region_map arm0 WHERE arm0.asset_id = a.id)
          OR EXISTS (
            SELECT 1
            FROM dam_asset_region_map arm1
            WHERE arm1.asset_id = a.id
              AND upper(trim(arm1.region_code)) = ANY (v_company_codes)
          )
        )
        -- Locale entitlement: only restrict if any locale encodes a country subtag
        AND (
          NOT EXISTS (
            SELECT 1
            FROM dam_asset_locale_map alm0
            WHERE alm0.asset_id = a.id
              AND (
                alm0.locale_code ~* '[-_][a-z]{2}$'
              )
          )
          OR EXISTS (
            SELECT 1
            FROM dam_asset_locale_map alm1
            WHERE alm1.asset_id = a.id
              AND (
                upper(substring(alm1.locale_code from '([a-z]{2})$')) = ANY (v_company_codes)
              )
          )
        )
        -- Audience entitlement: only restrict if company has any audience mappings
        AND (
          NOT EXISTS (SELECT 1 FROM dam_asset_audience_map aam0 WHERE aam0.asset_id = a.id)
          OR v_company_has_audiences = false
          OR EXISTS (
            SELECT 1
            FROM dam_asset_audience_map aam1
            WHERE aam1.asset_id = a.id
              AND aam1.audience_id = ANY (v_company_audience_ids)
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

