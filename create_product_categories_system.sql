-- Create product categories system with visibility controls

-- Create categories table
CREATE TABLE "categories" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "sort_order" INTEGER DEFAULT 0,
  "visible_to_americas" BOOLEAN DEFAULT true,
  "visible_to_international" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add category_id to Products table
ALTER TABLE "Products" 
ADD COLUMN "category_id" INTEGER REFERENCES "categories"("id");

-- Insert default categories
INSERT INTO "categories" ("name", "description", "sort_order", "visible_to_americas", "visible_to_international") VALUES
('ProCtrl', 'Professional Control Products', 1, true, true),
('SelfCtrl', 'Self Control Products', 2, true, true),
('KITS', 'Product Kits and Bundles', 3, true, true),
('Accessories', 'Accessories and Add-ons', 4, true, true);

-- Create indexes for better performance
CREATE INDEX idx_categories_sort_order ON "categories"("sort_order");
CREATE INDEX idx_categories_visibility_americas ON "categories"("visible_to_americas");
CREATE INDEX idx_categories_visibility_international ON "categories"("visible_to_international");
CREATE INDEX idx_products_category_id ON "Products"("category_id");

-- Add comments for documentation
COMMENT ON TABLE "categories" IS 'Product categories for organizing products in order forms and packing lists';
COMMENT ON COLUMN "categories"."name" IS 'Category name (e.g., ProCtrl, SelfCtrl, KITS, Accessories)';
COMMENT ON COLUMN "categories"."description" IS 'Optional description of the category';
COMMENT ON COLUMN "categories"."sort_order" IS 'Display order of categories (lower numbers appear first)';
COMMENT ON COLUMN "categories"."visible_to_americas" IS 'Whether this category is visible to Americas clients';
COMMENT ON COLUMN "categories"."visible_to_international" IS 'Whether this category is visible to International clients';
COMMENT ON COLUMN "Products"."category_id" IS 'Foreign key reference to categories table';

-- Create RLS policies for categories (if RLS is enabled)
-- ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Categories are viewable by everyone" ON "categories" FOR SELECT USING (true);
-- CREATE POLICY "Only admins can modify categories" ON "categories" FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Verify the setup
SELECT 
  c.id,
  c.name,
  c.description,
  c.sort_order,
  c.visible_to_americas,
  c.visible_to_international,
  COUNT(p.id) as product_count
FROM "categories" c
LEFT JOIN "Products" p ON c.id = p.category_id
GROUP BY c.id, c.name, c.description, c.sort_order, c.visible_to_americas, c.visible_to_international
ORDER BY c.sort_order;
