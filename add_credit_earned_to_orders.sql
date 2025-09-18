-- Add credit_earned field to orders table to store the support fund credit earned during order placement

-- Add the new column
ALTER TABLE "orders" 
ADD COLUMN "credit_earned" DECIMAL(10,2) DEFAULT 0.00;

-- Add comment for documentation
COMMENT ON COLUMN "orders"."credit_earned" IS 'Amount of support fund credit earned from this order based on qualifying products and company support fund percentage';

-- Update existing orders to calculate their credit earned (optional - for historical data)
-- This calculates based on order items and company support fund percentage
-- You can run this if you want to populate historical data, or skip it for new orders only

-- Verify the new column
SELECT 
  id, 
  total_value, 
  support_fund_used, 
  credit_earned,
  created_at 
FROM orders 
ORDER BY created_at DESC 
LIMIT 5;
