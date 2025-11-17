-- --------------------------------------------------
-- Update Image and Artwork Subtypes
-- Clarify: Image = finished exports (JPG/PNG/WebP), Artwork = editable layered files (PSD/AI/EPS/SVG)
-- --------------------------------------------------

DO $$
DECLARE
  v_image_id UUID;
  v_artwork_id UUID;
BEGIN
  SELECT id INTO v_image_id FROM dam_asset_types WHERE slug = 'image';
  SELECT id INTO v_artwork_id FROM dam_asset_types WHERE slug = 'artwork';

  -- Delete old Image subtypes
  DELETE FROM dam_asset_subtypes WHERE asset_type_id = v_image_id;
  
  -- Insert updated Image Sub-Types (finished, exported, flattened visuals)
  INSERT INTO dam_asset_subtypes (name, slug, asset_type_id, display_order) VALUES
    ('Product Packshot', 'product-packshot', v_image_id, 1),
    ('Product Group Shot', 'product-group-shot', v_image_id, 2),
    ('Lifestyle Image', 'lifestyle-image', v_image_id, 3),
    ('Before & After', 'before-after', v_image_id, 4),
    ('Packaging Renders', 'packaging-renders', v_image_id, 5),
    ('Social Image', 'social-image', v_image_id, 6),
    ('Campaign KV', 'campaign-kv', v_image_id, 7),
    ('Branding / Logo Image', 'branding-logo-image', v_image_id, 8)
  ON CONFLICT (asset_type_id, slug) DO UPDATE
  SET name = EXCLUDED.name,
      display_order = EXCLUDED.display_order;

  -- Delete old Artwork subtypes
  DELETE FROM dam_asset_subtypes WHERE asset_type_id = v_artwork_id;
  
  -- Insert updated Artwork Sub-Types (editable, layered, template or master design files)
  INSERT INTO dam_asset_subtypes (name, slug, asset_type_id, display_order) VALUES
    ('Logo Master Files', 'logo-master-files', v_artwork_id, 1),
    ('Fonts', 'fonts', v_artwork_id, 2),
    ('Packaging Templates', 'packaging-templates', v_artwork_id, 3),
    ('Design Templates', 'design-templates', v_artwork_id, 4),
    ('Social Templates', 'social-templates', v_artwork_id, 5),
    ('Print-Ready Artwork', 'print-ready-artwork', v_artwork_id, 6),
    ('Brand Iconography', 'brand-iconography', v_artwork_id, 7)
  ON CONFLICT (asset_type_id, slug) DO UPDATE
  SET name = EXCLUDED.name,
      display_order = EXCLUDED.display_order;

END $$;

