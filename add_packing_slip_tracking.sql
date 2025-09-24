-- Add packing slip tracking to orders table
ALTER TABLE orders 
ADD COLUMN packing_slip_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN packing_slip_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN packing_slip_generated_by UUID REFERENCES auth.users(id);

-- Add packing slip data table
CREATE TABLE IF NOT EXISTS packing_slips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  invoice_number VARCHAR(255) NOT NULL,
  shipping_method VARCHAR(50) NOT NULL,
  netsuite_reference VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Add RLS policies for packing_slips table
ALTER TABLE packing_slips ENABLE ROW LEVEL SECURITY;

-- Policy for admins to see all packing slips
CREATE POLICY "Admins can view all packing slips" ON packing_slips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- Policy for clients to see their own packing slips
CREATE POLICY "Clients can view their own packing slips" ON packing_slips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders 
      JOIN clients ON orders.user_id = clients.id
      WHERE orders.id = packing_slips.order_id 
      AND clients.id = auth.uid()
    )
  );

-- Policy for admins to create packing slips
CREATE POLICY "Admins can create packing slips" ON packing_slips
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- Policy for admins to update packing slips
CREATE POLICY "Admins can update packing slips" ON packing_slips
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );
