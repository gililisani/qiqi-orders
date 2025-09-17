-- Add sort_order field to Products table for hierarchy control
-- This allows admins to control the display order of products in the Order Form

-- Add sort_order column to Products table
ALTER TABLE "Products" 
ADD COLUMN "sort_order" INTEGER DEFAULT 0;

-- Update existing products to have incremental sort_order values
-- This ensures existing products have a default order
UPDATE "Products" 
SET "sort_order" = ROW_NUMBER() OVER (ORDER BY "item_name")
WHERE "sort_order" IS NULL OR "sort_order" = 0;

-- Create an index for better query performance when ordering by sort_order
CREATE INDEX idx_products_sort_order ON "Products"("sort_order", "enable");

-- Add comment for documentation
COMMENT ON COLUMN "Products"."sort_order" IS 'Display order for products in Order Form (lower numbers appear first)';
