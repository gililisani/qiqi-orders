-- Script 2: Add indexes and RLS for target_periods
CREATE INDEX IF NOT EXISTS idx_target_periods_company_id ON target_periods(company_id);
CREATE INDEX IF NOT EXISTS idx_target_periods_dates ON target_periods(start_date, end_date);

ALTER TABLE target_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage target periods" ON target_periods
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

CREATE POLICY "Clients can view their company target periods" ON target_periods
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = auth.uid() 
      AND clients.company_id = target_periods.company_id
    )
  );
