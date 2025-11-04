-- Add out_of_stock column to Products table
-- This allows admins to mark products as out of stock

-- Add the column with default value of false (products are in stock by default)
ALTER TABLE "Products"
ADD COLUMN IF NOT EXISTS out_of_stock BOOLEAN NOT NULL DEFAULT false;

-- Add a comment to document the column
COMMENT ON COLUMN "Products".out_of_stock IS 'If true, product is out of stock and should display "Out of Stock" message in order forms.';
