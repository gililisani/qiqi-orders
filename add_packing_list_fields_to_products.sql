-- Add packing list fields to Products table for international shipping documentation

-- Add the new fields
ALTER TABLE "Products" 
ADD COLUMN "case_weight" DECIMAL(10,2),
ADD COLUMN "hs_code" TEXT,
ADD COLUMN "made_in" TEXT;

-- Add comments for documentation
COMMENT ON COLUMN "Products"."case_weight" IS 'Weight of one case in kilograms (for packing list calculations)';
COMMENT ON COLUMN "Products"."hs_code" IS 'Harmonized System Code for international customs and shipping';
COMMENT ON COLUMN "Products"."made_in" IS 'Country of origin/manufacture for customs documentation';

-- Create indexes for better performance on searches
CREATE INDEX idx_products_hs_code ON "Products"("hs_code");
CREATE INDEX idx_products_made_in ON "Products"("made_in");

-- Verify the new columns
SELECT 
  id,
  item_name,
  sku,
  case_weight,
  hs_code,
  made_in,
  created_at 
FROM "Products" 
ORDER BY created_at DESC 
LIMIT 5;
