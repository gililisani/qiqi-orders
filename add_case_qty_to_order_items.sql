-- Add case_qty column to order_items table and rename quantity to total_items
-- This will make it easier to fetch information when editing existing orders

-- Step 1: Add the new case_qty column
ALTER TABLE order_items 
ADD COLUMN case_qty INTEGER;

-- Step 2: Calculate and populate case_qty for existing records
-- This calculates cases based on total_items divided by pack size
UPDATE order_items 
SET case_qty = CASE 
    WHEN p.pack IS NOT NULL AND p.pack > 0 THEN 
        FLOOR(order_items.quantity / p.pack)
    ELSE 
        FLOOR(order_items.quantity / 12) -- Default to 12 if pack is not set
END
FROM Products p 
WHERE order_items.product_id = p.id;

-- Step 3: Rename quantity column to total_items for clarity
ALTER TABLE order_items 
RENAME COLUMN quantity TO total_items;

-- Step 4: Add a comment to clarify the column purpose
COMMENT ON COLUMN order_items.total_items IS 'Total number of individual units ordered';
COMMENT ON COLUMN order_items.case_qty IS 'Number of cases ordered (calculated from total_items / pack)';

-- Step 5: Update any indexes or constraints if needed
-- (No specific indexes to update in this case)
