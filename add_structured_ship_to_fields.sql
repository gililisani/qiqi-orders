-- Migration: Add structured ship-to address fields for 3PL export
-- These fields will be used for reliable XLSX export to 3PL systems

ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS ship_to_street_line_1 TEXT,
ADD COLUMN IF NOT EXISTS ship_to_street_line_2 TEXT,
ADD COLUMN IF NOT EXISTS ship_to_city TEXT,
ADD COLUMN IF NOT EXISTS ship_to_state TEXT,
ADD COLUMN IF NOT EXISTS ship_to_postal_code TEXT,
ADD COLUMN IF NOT EXISTS ship_to_country TEXT;

-- Add comments for documentation
COMMENT ON COLUMN companies.ship_to_street_line_1 IS 'Ship-to address street line 1 (for 3PL export)';
COMMENT ON COLUMN companies.ship_to_street_line_2 IS 'Ship-to address street line 2 (for 3PL export)';
COMMENT ON COLUMN companies.ship_to_city IS 'Ship-to city (for 3PL export)';
COMMENT ON COLUMN companies.ship_to_state IS 'Ship-to state/province (for 3PL export)';
COMMENT ON COLUMN companies.ship_to_postal_code IS 'Ship-to postal/zip code (for 3PL export)';
COMMENT ON COLUMN companies.ship_to_country IS 'Ship-to country (for 3PL export)';

-- Note: The existing 'ship_to' field remains as a free-form backup/display field

