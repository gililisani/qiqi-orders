-- Create standalone_slis table for standalone SLI documents
CREATE TABLE IF NOT EXISTS standalone_slis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sli_number INTEGER UNIQUE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  consignee_name TEXT NOT NULL,
  consignee_address_line1 TEXT NOT NULL,
  consignee_address_line2 TEXT,
  consignee_address_line3 TEXT,
  consignee_country TEXT NOT NULL,
  
  -- Invoice & Dates
  invoice_number TEXT NOT NULL,
  sli_date DATE NOT NULL,
  date_of_export DATE,
  
  -- Forwarding Agent
  forwarding_agent_line1 TEXT,
  forwarding_agent_line2 TEXT,
  forwarding_agent_line3 TEXT,
  forwarding_agent_line4 TEXT,
  
  -- Additional Fields
  in_bond_code TEXT,
  instructions_to_forwarder TEXT,
  
  -- Products (stored as JSONB - array of product selections with quantities)
  selected_products JSONB NOT NULL DEFAULT '[]',
  
  -- Checkbox States
  checkbox_states JSONB DEFAULT '{}',
  
  -- Metadata
  created_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- PDF Storage
  pdf_url TEXT
);

-- Create index for SLI number lookup
CREATE INDEX IF NOT EXISTS idx_standalone_slis_sli_number ON standalone_slis(sli_number);
CREATE INDEX IF NOT EXISTS idx_standalone_slis_company_id ON standalone_slis(company_id);
CREATE INDEX IF NOT EXISTS idx_standalone_slis_created_at ON standalone_slis(created_at DESC);

-- Create function to auto-generate SLI number
CREATE OR REPLACE FUNCTION generate_sli_number()
RETURNS INTEGER AS $$
DECLARE
  next_number INTEGER;
BEGIN
  -- Get the highest SLI number and add 1, starting from 100000
  SELECT COALESCE(MAX(sli_number), 99999) + 1 INTO next_number
  FROM standalone_slis;
  
  RETURN next_number;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_standalone_slis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_standalone_slis_updated_at
  BEFORE UPDATE ON standalone_slis
  FOR EACH ROW
  EXECUTE FUNCTION update_standalone_slis_updated_at();

