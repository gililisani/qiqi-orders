-- IMMEDIATE FIX: Add missing created_at column to order_items table
-- This will fix the "column order_items.created_at does not exist" error

-- Add the created_at column if it doesn't exist
DO $$ 
BEGIN
    -- Check if the column already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' 
        AND column_name = 'created_at'
    ) THEN
        -- Add the created_at column with default value
        ALTER TABLE "order_items" 
        ADD COLUMN "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        
        -- Update existing records to have a created_at timestamp
        UPDATE "order_items" 
        SET "created_at" = NOW()
        WHERE "created_at" IS NULL;
        
        -- Make the column NOT NULL after updating existing data
        ALTER TABLE "order_items" 
        ALTER COLUMN "created_at" SET NOT NULL;
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN "order_items"."created_at" IS 'Timestamp when the order item was created';

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'order_items' 
AND column_name = 'created_at';
