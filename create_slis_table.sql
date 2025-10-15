-- Create SLIs (Shipper's Letter of Instruction) table
CREATE TABLE IF NOT EXISTS slis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES admins(id),
  
  -- Admin Input Fields (from popup)
  forwarding_agent_line1 TEXT,
  forwarding_agent_line2 TEXT,
  forwarding_agent_line3 TEXT,
  forwarding_agent_line4 TEXT,
  date_of_export DATE,
  in_bond_code TEXT,
  instructions_to_forwarder TEXT,
  
  -- Checkbox States (stored as JSONB for flexibility)
  checkbox_states JSONB DEFAULT '{
    "related_party_related": false,
    "related_party_non_related": false,
    "routed_export_yes": false,
    "routed_export_no": false,
    "consignee_type_government": false,
    "consignee_type_direct_consumer": false,
    "consignee_type_other_unknown": false,
    "consignee_type_reseller": false,
    "hazardous_material_yes": false,
    "hazardous_material_no": false,
    "tib_carnet_yes": false,
    "tib_carnet_no": false,
    "insurance_yes": false,
    "insurance_no": false,
    "payment_prepaid": false,
    "payment_collect": false,
    "checkbox_39": false,
    "checkbox_40": false,
    "checkbox_48": false
  }'::jsonb,
  
  -- Signature
  signature_image_url TEXT,
  signature_date DATE,
  
  -- PDF Storage
  pdf_url TEXT,
  
  -- Unique constraint: one SLI per order
  CONSTRAINT unique_sli_per_order UNIQUE(order_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_slis_order_id ON slis(order_id);
CREATE INDEX IF NOT EXISTS idx_slis_created_by ON slis(created_by);

-- Enable RLS
ALTER TABLE slis ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admins can do everything
CREATE POLICY "Admins can manage all SLIs"
  ON slis
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins WHERE admins.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins WHERE admins.id = auth.uid()
    )
  );

-- Clients can only view SLIs for their company's orders
CREATE POLICY "Clients can view their company SLIs"
  ON slis
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN clients ON orders.company_id = clients.company_id
      WHERE orders.id = slis.order_id
      AND clients.id = auth.uid()
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_slis_updated_at
  BEFORE UPDATE ON slis
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON slis TO authenticated;

COMMENT ON TABLE slis IS 'Stores Shipper''s Letter of Instruction data for orders';

