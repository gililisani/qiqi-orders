-- Add flag to control which products qualify for earning support fund credit
-- This fixes the core issue where some products (kits, discounted, promotional) 
-- should not contribute to credit earning but can still be ordered

-- Add the qualifies_for_credit_earning column if it doesn't exist
DO $$ 
BEGIN
    -- Check if the column already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Products' 
        AND column_name = 'qualifies_for_credit_earning'
    ) THEN
        -- Add the qualifies_for_credit_earning column with default true
        ALTER TABLE "Products" 
        ADD COLUMN "qualifies_for_credit_earning" BOOLEAN DEFAULT TRUE NOT NULL;
        
        -- Set existing products to true by default (assume they qualify unless specified)
        UPDATE "Products" 
        SET "qualifies_for_credit_earning" = TRUE
        WHERE "qualifies_for_credit_earning" IS NULL;
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN "Products"."qualifies_for_credit_earning" IS 'Indicates if this product contributes to earning support fund credit. Kits, discounted, and promotional items should be FALSE.';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_products_credit_earning ON "Products"("qualifies_for_credit_earning");

-- Example: Mark kit products as non-credit-earning (update as needed)
-- UPDATE "Products" 
-- SET "qualifies_for_credit_earning" = FALSE 
-- WHERE "sku" LIKE 'KIT%' OR "item_name" ILIKE '%kit%';

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'Products' 
AND column_name = 'qualifies_for_credit_earning';

-- Show current products and their credit earning status
SELECT 
    "sku",
    "item_name",
    "list_in_support_funds",
    "qualifies_for_credit_earning",
    CASE 
        WHEN "qualifies_for_credit_earning" = FALSE THEN 'Does NOT earn credit'
        ELSE 'Earns credit'
    END as credit_status
FROM "Products"
WHERE "enable" = TRUE
ORDER BY "sku"
LIMIT 20;
