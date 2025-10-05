-- Add number_of_pallets column to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS number_of_pallets INTEGER;

-- Add comment to document the column
COMMENT ON COLUMN orders.number_of_pallets IS 'Number of pallets for the order, required when status changes to Ready';
