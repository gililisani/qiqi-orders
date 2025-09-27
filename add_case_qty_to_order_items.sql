-- Add case_qty column to order_items table and rename quantity to total_items

-- Step 1: Add the new case_qty column
ALTER TABLE order_items 
ADD COLUMN case_qty INTEGER;

-- Step 2: Rename quantity column to total_items for clarity
ALTER TABLE order_items 
RENAME COLUMN quantity TO total_items;

-- Step 3: Set default case_qty to 0 for existing records
UPDATE order_items 
SET case_qty = 0 
WHERE case_qty IS NULL;

-- Step 4: Add comments to clarify the column purpose
COMMENT ON COLUMN order_items.total_items IS 'Total number of individual units ordered';
COMMENT ON COLUMN order_items.case_qty IS 'Number of cases ordered (calculated from total_items / pack)';

-- NOTE: The case_qty calculation will be handled in the application code
-- since we need to access the Products table to get the pack size