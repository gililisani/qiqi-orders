-- IMMEDIATE FIX: Add missing is_support_fund_item column to order_items table
-- This will fix the "column order_items.is_support_fund_item does not exist" error

-- Add the is_support_fund_item column if it doesn't exist
DO $$ 
BEGIN
    -- Check if the column already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' 
        AND column_name = 'is_support_fund_item'
    ) THEN
        -- Add the is_support_fund_item column with default false
        ALTER TABLE "order_items" 
        ADD COLUMN "is_support_fund_item" BOOLEAN DEFAULT FALSE NOT NULL;
        
        -- Update existing records to have default value
        UPDATE "order_items" 
        SET "is_support_fund_item" = FALSE
        WHERE "is_support_fund_item" IS NULL;
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN "order_items"."is_support_fund_item" IS 'Indicates if this item was purchased using support fund credit';

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'order_items' 
AND column_name = 'is_support_fund_item';
