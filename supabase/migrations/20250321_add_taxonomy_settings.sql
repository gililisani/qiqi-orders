-- Migration: Add Taxonomy Settings Support
-- This migration adds support for managing taxonomy settings (product lines, locales, etc.)

-- 1. Create product_lines lookup table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS dam_product_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL, -- ProCtrl, SelfCtrl, Both, None
  name TEXT NOT NULL, -- Display name
  slug TEXT UNIQUE NOT NULL, -- URL-friendly slug
  active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default product lines if they don't exist
INSERT INTO dam_product_lines (code, name, slug, active, display_order)
VALUES 
  ('ProCtrl', 'ProCtrl', 'proctrl', true, 1),
  ('SelfCtrl', 'SelfCtrl', 'selfctrl', true, 2),
  ('Both', 'Both', 'both', true, 3),
  ('None', 'None', 'none', true, 4)
ON CONFLICT (code) DO NOTHING;

-- 2. Add active column to dam_locales if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dam_locales' AND column_name = 'active'
  ) THEN
    ALTER TABLE dam_locales ADD COLUMN active BOOLEAN DEFAULT true;
    -- Set all existing locales to active
    UPDATE dam_locales SET active = true WHERE active IS NULL;
  END IF;
END $$;

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_dam_product_lines_active ON dam_product_lines(active);
CREATE INDEX IF NOT EXISTS idx_dam_product_lines_code ON dam_product_lines(code);
CREATE INDEX IF NOT EXISTS idx_dam_locales_active ON dam_locales(active);
CREATE INDEX IF NOT EXISTS idx_dam_asset_types_active ON dam_asset_types(active);
CREATE INDEX IF NOT EXISTS idx_dam_asset_subtypes_active ON dam_asset_subtypes(active);

-- 4. Enable RLS on product_lines table
ALTER TABLE dam_product_lines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_lines
CREATE POLICY "Admins can view all product lines"
  ON dam_product_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid() AND admins.enabled = true
    )
  );

CREATE POLICY "Admins can manage product lines"
  ON dam_product_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid() AND admins.enabled = true
    )
  );

