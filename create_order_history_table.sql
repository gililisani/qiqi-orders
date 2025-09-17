-- Create order history table for audit trail
CREATE TABLE IF NOT EXISTS "order_history" (
  "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "order_id" UUID NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "status_from" TEXT,
  "status_to" TEXT NOT NULL,
  "changed_by" UUID REFERENCES "auth"."users"("id"),
  "changed_by_name" TEXT,
  "changed_by_role" TEXT,
  "notes" TEXT,
  "netsuite_sync_status" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX idx_order_history_order_id ON "order_history"("order_id");
CREATE INDEX idx_order_history_created_at ON "order_history"("created_at");
CREATE INDEX idx_order_history_status_to ON "order_history"("status_to");

-- Add RLS (Row Level Security) policies
ALTER TABLE "order_history" ENABLE ROW LEVEL SECURITY;

-- Policy for admins to see all order history
CREATE POLICY "Admins can view all order history" ON "order_history"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "admins" 
    WHERE "id" = auth.uid()
  )
);

-- Policy for clients to see their own order history
CREATE POLICY "Clients can view their own order history" ON "order_history"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "orders" o
    JOIN "clients" c ON c.id = o.user_id
    WHERE o.id = order_history.order_id
    AND c.id = auth.uid()
  )
);

-- Policy for admins to insert order history
CREATE POLICY "Admins can insert order history" ON "order_history"
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "admins" 
    WHERE "id" = auth.uid()
  )
);

-- Add comments for documentation
COMMENT ON TABLE "order_history" IS 'Audit trail for order status changes and important events';
COMMENT ON COLUMN "order_history"."order_id" IS 'Reference to the order';
COMMENT ON COLUMN "order_history"."status_from" IS 'Previous status (null for initial status)';
COMMENT ON COLUMN "order_history"."status_to" IS 'New status';
COMMENT ON COLUMN "order_history"."changed_by" IS 'User who made the change';
COMMENT ON COLUMN "order_history"."changed_by_name" IS 'Name of user who made the change (for display)';
COMMENT ON COLUMN "order_history"."changed_by_role" IS 'Role of user who made the change (admin/client)';
COMMENT ON COLUMN "order_history"."notes" IS 'Additional notes about the change';
COMMENT ON COLUMN "order_history"."netsuite_sync_status" IS 'Status of NetSuite synchronization';

-- Create a function to automatically log order status changes
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO "order_history" (
      "order_id",
      "status_from",
      "status_to",
      "changed_by",
      "netsuite_sync_status"
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      auth.uid(),
      NEW.netsuite_status
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically log order status changes
CREATE TRIGGER trigger_log_order_status_change
  AFTER UPDATE ON "orders"
  FOR EACH ROW
  EXECUTE FUNCTION log_order_status_change();

-- Insert initial history for existing orders (run once)
INSERT INTO "order_history" (
  "order_id",
  "status_from",
  "status_to",
  "notes",
  "created_at"
)
SELECT 
  "id",
  NULL,
  "status",
  'Initial status from migration',
  "created_at"
FROM "orders"
WHERE NOT EXISTS (
  SELECT 1 FROM "order_history" 
  WHERE "order_history"."order_id" = "orders"."id"
);
