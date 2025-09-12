-- Add class-based product visibility
-- This migration adds fields to control which client classes can see each product

-- Add columns to Products table for class-based visibility
ALTER TABLE "Products" 
ADD COLUMN "visible_to_americas" BOOLEAN DEFAULT true,
ADD COLUMN "visible_to_international" BOOLEAN DEFAULT true;

-- Update existing products to be visible to both classes by default
UPDATE "Products" 
SET 
  "visible_to_americas" = true,
  "visible_to_international" = true
WHERE "visible_to_americas" IS NULL OR "visible_to_international" IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN "Products"."visible_to_americas" IS 'Whether this product is visible to Americas class clients';
COMMENT ON COLUMN "Products"."visible_to_international" IS 'Whether this product is visible to International class clients';

-- Create an index for better query performance
CREATE INDEX idx_products_class_visibility ON "Products"("visible_to_americas", "visible_to_international", "enable");
