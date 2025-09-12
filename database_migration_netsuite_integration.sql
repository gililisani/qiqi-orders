-- Add NetSuite integration fields to existing tables

-- Add NetSuite fields to Products table
ALTER TABLE "Products" 
ADD COLUMN "netsuite_id" TEXT,
ADD COLUMN "netsuite_itemid" TEXT;

-- Add NetSuite fields to Companies table
ALTER TABLE "Companies" 
ADD COLUMN "netsuite_customer_id" TEXT;

-- Add NetSuite fields to Orders table
ALTER TABLE "orders" 
ADD COLUMN "netsuite_sales_order_id" TEXT,
ADD COLUMN "netsuite_status" TEXT DEFAULT 'pending';

-- Add NetSuite fields to Subsidiaries table
ALTER TABLE "subsidiaries" 
ADD COLUMN "netsuite_id" TEXT;

-- Add NetSuite fields to Locations table
ALTER TABLE "Locations" 
ADD COLUMN "netsuite_id" TEXT;

-- Create indexes for better performance
CREATE INDEX idx_products_netsuite_id ON "Products"("netsuite_id");
CREATE INDEX idx_products_netsuite_itemid ON "Products"("netsuite_itemid");
CREATE INDEX idx_companies_netsuite_customer_id ON "companies"("netsuite_customer_id");
CREATE INDEX idx_orders_netsuite_sales_order_id ON "orders"("netsuite_sales_order_id");
CREATE INDEX idx_subsidiaries_netsuite_id ON "subsidiaries"("netsuite_id");
CREATE INDEX idx_locations_netsuite_id ON "Locations"("netsuite_id");

-- Add comments for documentation
COMMENT ON COLUMN "Products"."netsuite_id" IS 'NetSuite internal ID for the product';
COMMENT ON COLUMN "Products"."netsuite_itemid" IS 'NetSuite item ID (external reference)';
COMMENT ON COLUMN "companies"."netsuite_customer_id" IS 'NetSuite customer ID for the company';
COMMENT ON COLUMN "orders"."netsuite_sales_order_id" IS 'NetSuite sales order ID';
COMMENT ON COLUMN "orders"."netsuite_status" IS 'Status of the order in NetSuite (pending, created, fulfilled, etc.)';
COMMENT ON COLUMN "subsidiaries"."netsuite_id" IS 'NetSuite subsidiary ID';
COMMENT ON COLUMN "Locations"."netsuite_id" IS 'NetSuite location ID';
