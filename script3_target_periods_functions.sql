-- Script 3: Create trigger and functions for target_periods
CREATE TRIGGER update_target_periods_updated_at 
  BEFORE UPDATE ON target_periods 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION calculate_target_period_progress(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS DECIMAL(15,2) AS $$
DECLARE
  total_amount DECIMAL(15,2);
BEGIN
  SELECT COALESCE(SUM(total_value - COALESCE(support_fund_used, 0)), 0)
  INTO total_amount
  FROM orders
  WHERE company_id = p_company_id
    AND status = 'Done'
    AND created_at::DATE >= p_start_date
    AND created_at::DATE <= p_end_date;
  
  RETURN total_amount;
END;
$$ LANGUAGE plpgsql;
