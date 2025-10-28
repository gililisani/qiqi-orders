-- Phase 1: Company Contract System Migration
-- Adds contract information, territories, and notes system

-- 1. Add contract fields to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_execution_date DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_duration_months INTEGER DEFAULT 36;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS annual_target_amount DECIMAL(15,2);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_status TEXT DEFAULT 'active' CHECK (contract_status IN ('active', 'expired', 'suspended', 'terminated'));
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_annual_progress DECIMAL(15,2) DEFAULT 0;

-- 2. Create company territories table
CREATE TABLE IF NOT EXISTS company_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  country_code VARCHAR(2) NOT NULL, -- ISO country codes (US, CA, MX, etc.)
  country_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, country_code)
);

-- 3. Create company notes table (admin-created, company-visible)
CREATE TABLE IF NOT EXISTS company_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  note_type TEXT NOT NULL CHECK (note_type IN ('meeting', 'webinar', 'event', 'feedback')),
  meeting_date DATE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create note attachments table
CREATE TABLE IF NOT EXISTS note_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES company_notes(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create admin notes table (admin-only internal notes)
CREATE TABLE IF NOT EXISTS admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_company_territories_company_id ON company_territories(company_id);
CREATE INDEX IF NOT EXISTS idx_company_territories_country_code ON company_territories(country_code);
CREATE INDEX IF NOT EXISTS idx_company_notes_company_id ON company_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_company_notes_note_type ON company_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_company_notes_meeting_date ON company_notes(meeting_date);
CREATE INDEX IF NOT EXISTS idx_note_attachments_note_id ON note_attachments(note_id);
CREATE INDEX IF NOT EXISTS idx_admin_notes_company_id ON admin_notes(company_id);

-- 7. Enable RLS on all new tables
ALTER TABLE company_territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;

-- 8. Create RLS policies for company_territories
-- Admins can do everything
CREATE POLICY "Admins can manage company territories" ON company_territories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- Clients can view their company's territories
CREATE POLICY "Clients can view their company territories" ON company_territories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = auth.uid() 
      AND clients.company_id = company_territories.company_id
    )
  );

-- 9. Create RLS policies for company_notes
-- Admins can do everything
CREATE POLICY "Admins can manage company notes" ON company_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- Clients can view their company's notes
CREATE POLICY "Clients can view their company notes" ON company_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = auth.uid() 
      AND clients.company_id = company_notes.company_id
    )
  );

-- 10. Create RLS policies for note_attachments
-- Admins can do everything
CREATE POLICY "Admins can manage note attachments" ON note_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- Clients can view attachments for their company's notes
CREATE POLICY "Clients can view their company note attachments" ON note_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients 
      JOIN company_notes ON company_notes.company_id = clients.company_id
      WHERE clients.id = auth.uid() 
      AND company_notes.id = note_attachments.note_id
    )
  );

-- 11. Create RLS policies for admin_notes (admin-only)
CREATE POLICY "Admins can manage admin notes" ON admin_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- 12. Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 13. Create triggers for updated_at
CREATE TRIGGER update_company_notes_updated_at 
  BEFORE UPDATE ON company_notes 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_notes_updated_at 
  BEFORE UPDATE ON admin_notes 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 14. Add some sample data for testing (optional - remove in production)
-- INSERT INTO company_territories (company_id, country_code, country_name) 
-- SELECT id, 'US', 'United States' FROM companies LIMIT 1;

-- 15. Create view for contract summary (useful for reporting)
CREATE OR REPLACE VIEW contract_summary AS
SELECT 
  c.id,
  c.company_name,
  c.contract_execution_date,
  c.contract_duration_months,
  c.contract_execution_date + INTERVAL '1 month' * c.contract_duration_months AS contract_expiry_date,
  c.annual_target_amount,
  c.current_annual_progress,
  CASE 
    WHEN c.annual_target_amount > 0 THEN 
      ROUND((c.current_annual_progress / c.annual_target_amount) * 100, 2)
    ELSE 0 
  END AS progress_percentage,
  c.contract_status,
  COUNT(ct.id) AS territory_count,
  STRING_AGG(ct.country_name, ', ') AS territories
FROM companies c
LEFT JOIN company_territories ct ON c.id = ct.company_id
GROUP BY c.id, c.company_name, c.contract_execution_date, c.contract_duration_months, 
         c.annual_target_amount, c.current_annual_progress, c.contract_status;

-- Grant permissions on the view
GRANT SELECT ON contract_summary TO authenticated;

-- 16. Add comments for documentation
COMMENT ON TABLE company_territories IS 'Stores exclusive territories for each company';
COMMENT ON TABLE company_notes IS 'Admin-created notes visible to company users';
COMMENT ON TABLE note_attachments IS 'File attachments for company notes';
COMMENT ON TABLE admin_notes IS 'Admin-only internal notes about companies';
COMMENT ON COLUMN companies.contract_execution_date IS 'Date when the contract was signed';
COMMENT ON COLUMN companies.contract_duration_months IS 'Contract duration in months (typically 36-72)';
COMMENT ON COLUMN companies.annual_target_amount IS 'Annual sales target amount';
COMMENT ON COLUMN companies.current_annual_progress IS 'Current progress towards annual target';
COMMENT ON COLUMN companies.contract_status IS 'Status: active, expired, suspended, terminated';
