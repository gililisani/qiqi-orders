-- Add image_url field to categories table

ALTER TABLE "categories" 
ADD COLUMN "image_url" TEXT;

COMMENT ON COLUMN "categories"."image_url" IS 'URL of the category image for visual display in order forms and admin interfaces';

-- Update existing categories with placeholder images (optional)
-- You can remove this section if you prefer to upload images manually
UPDATE "categories" 
SET "image_url" = CASE 
  WHEN "name" = 'ProCtrl' THEN 'https://via.placeholder.com/300x150/4F46E5/FFFFFF?text=ProCtrl'
  WHEN "name" = 'SelfCtrl' THEN 'https://via.placeholder.com/300x150/059669/FFFFFF?text=SelfCtrl'
  WHEN "name" = 'KITS' THEN 'https://via.placeholder.com/300x150/DC2626/FFFFFF?text=KITS'
  WHEN "name" = 'Accessories' THEN 'https://via.placeholder.com/300x150/7C3AED/FFFFFF?text=Accessories'
  ELSE NULL
END
WHERE "image_url" IS NULL;

-- Verify the changes
SELECT 
  id,
  name,
  image_url,
  sort_order,
  visible_to_americas,
  visible_to_international
FROM "categories"
ORDER BY "sort_order";
