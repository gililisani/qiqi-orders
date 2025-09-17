-- IMMEDIATE FIX: Add missing total_price column to order_items table
-- This will fix the "Could not find the 'total_price' column" error

-- Add the total_price column if it doesn't exist
DO $$ 
BEGIN
    -- Check if the column already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' 
        AND column_name = 'total_price'
    ) THEN
        -- Add the total_price column
        ALTER TABLE "order_items" 
        ADD COLUMN "total_price" DECIMAL(10,2);
        
        -- Update existing records to calculate total_price (quantity * unit_price)
        UPDATE "order_items" 
        SET "total_price" = "quantity" * "unit_price"
        WHERE "total_price" IS NULL;
        
        -- Make the column NOT NULL after updating existing data
        ALTER TABLE "order_items" 
        ALTER COLUMN "total_price" SET NOT NULL;
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN "order_items"."total_price" IS 'Total price for this line item (quantity * unit_price)';

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'order_items' 
AND column_name = 'total_price';
