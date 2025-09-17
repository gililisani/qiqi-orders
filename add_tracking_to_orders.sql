-- Add tracking number field to orders table
ALTER TABLE "orders" 
ADD COLUMN "tracking_number" TEXT;

-- Add comment for documentation
COMMENT ON COLUMN "orders"."tracking_number" IS 'Tracking number for shipped orders (optional)';

-- Create index for tracking number lookups
CREATE INDEX idx_orders_tracking_number ON "orders"("tracking_number") WHERE "tracking_number" IS NOT NULL;
