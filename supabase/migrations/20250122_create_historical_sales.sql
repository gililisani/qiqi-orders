-- Create historical_sales table for tracking pre-system sales data
CREATE TABLE IF NOT EXISTS historical_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES admins(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_historical_sales_company_date ON historical_sales(company_id, sale_date);

-- Create unique constraint to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_historical_sales_unique ON historical_sales(company_id, sale_date);

-- Add RLS policies (admin-only access)
ALTER TABLE historical_sales ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage historical sales"
  ON historical_sales
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.id = auth.uid()
    )
  );

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_historical_sales_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_historical_sales_updated_at
  BEFORE UPDATE ON historical_sales
  FOR EACH ROW
  EXECUTE FUNCTION update_historical_sales_updated_at();

