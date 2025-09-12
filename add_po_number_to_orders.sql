-- Add PO/Cheque Number field to orders table
ALTER TABLE "orders" 
ADD COLUMN "po_number" TEXT;

-- Add comment for documentation
COMMENT ON COLUMN "orders"."po_number" IS 'Purchase Order or Cheque Number provided by the client (optional)';
