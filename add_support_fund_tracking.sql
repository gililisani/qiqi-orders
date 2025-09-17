-- Add support fund tracking to order_items table
-- This will help us identify and highlight items purchased with support funds

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
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN "order_items"."is_support_fund_item" IS 'Indicates if this item was purchased using support fund credit';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_order_items_support_fund ON "order_items"("is_support_fund_item") WHERE "is_support_fund_item" = TRUE;

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'order_items' 
AND column_name = 'is_support_fund_item';
