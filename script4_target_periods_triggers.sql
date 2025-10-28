-- Script 4: Create trigger for auto-updating target progress
CREATE OR REPLACE FUNCTION update_all_target_periods_progress()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE target_periods
  SET current_progress = calculate_target_period_progress(
    COALESCE(NEW.company_id, OLD.company_id),
    start_date,
    end_date
  )
  WHERE company_id = COALESCE(NEW.company_id, OLD.company_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_target_progress_on_order_change
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_all_target_periods_progress();
