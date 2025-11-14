-- Update locales: Remove en-GB, add French, keep English (US) and Spanish
-- Remove English UK
DELETE FROM dam_locales WHERE code = 'en-GB';

-- Add French if it doesn't exist
INSERT INTO dam_locales (code, label, is_default)
VALUES ('fr-FR', 'French', FALSE)
ON CONFLICT (code) DO NOTHING;

-- Ensure English US and Spanish exist (they should already be there)
INSERT INTO dam_locales (code, label, is_default)
VALUES 
  ('en-US', 'English', TRUE),
  ('es-MX', 'Spanish', FALSE)
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label;

