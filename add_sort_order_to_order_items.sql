-- Add sort_order field to order_items table for product hierarchy control

-- Add the sort_order column
ALTER TABLE "order_items" 
ADD COLUMN "sort_order" INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN "order_items"."sort_order" IS 'Display order of products in the order (0 = first, higher numbers = later)';

-- Create index for better performance on sorting
CREATE INDEX idx_order_items_sort_order ON "order_items"("order_id", "sort_order");

-- Update existing order items with incremental sort order based on creation order
UPDATE "order_items" 
SET "sort_order" = subquery.row_num - 1
FROM (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at, id) as row_num
  FROM "order_items"
) as subquery
WHERE "order_items".id = subquery.id;

-- Verify the sort order assignment
SELECT 
  order_id,
  product_id,
  quantity,
  sort_order,
  created_at
FROM "order_items" 
ORDER BY order_id, sort_order 
LIMIT 10;
