-- Add image_url field to categories table

ALTER TABLE "categories" 
ADD COLUMN "image_url" TEXT;

COMMENT ON COLUMN "categories"."image_url" IS 'URL of the category image for visual display in order forms and admin interfaces';

-- Note: No placeholder images will be added
-- Admins should upload actual category images using the admin interface

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
