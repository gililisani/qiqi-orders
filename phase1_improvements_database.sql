-- Phase 1 Improvements: Multiple Target Periods and Enhanced Contract System
-- Updates the contract system to support multiple annual target periods

-- 1. Create target_periods table for multiple annual targets
CREATE TABLE IF NOT EXISTS target_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_name VARCHAR(100) NOT NULL, -- e.g., "Year 1", "Year 2", "Period 1"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  target_amount DECIMAL(15,2) NOT NULL,
  current_progress DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, start_date, end_date)
);

-- 2. Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_target_periods_company_id ON target_periods(company_id);
CREATE INDEX IF NOT EXISTS idx_target_periods_dates ON target_periods(start_date, end_date);

-- 3. Enable RLS on target_periods table
ALTER TABLE target_periods ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies for target_periods
-- Admins can do everything
CREATE POLICY "Admins can manage target periods" ON target_periods
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- Clients can view their company's target periods
CREATE POLICY "Clients can view their company target periods" ON target_periods
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = auth.uid() 
      AND clients.company_id = target_periods.company_id
    )
  );

-- 5. Create trigger for updated_at
CREATE TRIGGER update_target_periods_updated_at 
  BEFORE UPDATE ON target_periods 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Add comments for documentation
COMMENT ON TABLE target_periods IS 'Multiple annual target periods for each company';
COMMENT ON COLUMN target_periods.period_name IS 'Human-readable name for the target period';
COMMENT ON COLUMN target_periods.start_date IS 'Start date of the target period';
COMMENT ON COLUMN target_periods.end_date IS 'End date of the target period';
COMMENT ON COLUMN target_periods.target_amount IS 'Target amount for this period';
COMMENT ON COLUMN target_periods.current_progress IS 'Current progress towards this period target';

-- 7. Create function to calculate current progress for a target period
CREATE OR REPLACE FUNCTION calculate_target_period_progress(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS DECIMAL(15,2) AS $$
DECLARE
  total_amount DECIMAL(15,2);
BEGIN
  -- Calculate total from DONE orders (excluding cancelled) within the date range
  -- Exclude support funds from the calculation
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

-- 8. Create function to update all target period progress
CREATE OR REPLACE FUNCTION update_all_target_periods_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Update progress for all target periods of the company
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

-- 9. Create trigger to auto-update target progress when orders change
CREATE TRIGGER update_target_progress_on_order_change
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_all_target_periods_progress();

-- 10. Create view for enhanced contract summary with target periods
CREATE OR REPLACE VIEW enhanced_contract_summary AS
SELECT 
  c.id,
  c.company_name,
  c.contract_execution_date,
  c.contract_duration_months,
  c.contract_execution_date + INTERVAL '1 month' * c.contract_duration_months AS contract_expiry_date,
  c.contract_status,
  COUNT(ct.id) AS territory_count,
  STRING_AGG(ct.country_name, ', ') AS territories,
  COUNT(tp.id) AS target_period_count,
  COALESCE(SUM(tp.target_amount), 0) AS total_target_amount,
  COALESCE(SUM(tp.current_progress), 0) AS total_current_progress,
  CASE 
    WHEN SUM(tp.target_amount) > 0 THEN 
      ROUND((SUM(tp.current_progress) / SUM(tp.target_amount)) * 100, 2)
    ELSE 0 
  END AS overall_progress_percentage
FROM companies c
LEFT JOIN company_territories ct ON c.id = ct.company_id
LEFT JOIN target_periods tp ON c.id = tp.company_id
GROUP BY c.id, c.company_name, c.contract_execution_date, c.contract_duration_months, c.contract_status;

-- Grant permissions on the view
GRANT SELECT ON enhanced_contract_summary TO authenticated;

-- 11. Create function to get countries list for autocomplete
CREATE OR REPLACE FUNCTION get_countries_list()
RETURNS TABLE(country_code VARCHAR(2), country_name VARCHAR(100)) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'AD'::VARCHAR(2) as country_code, 'Andorra'::VARCHAR(100) as country_name
  UNION ALL SELECT 'AE', 'United Arab Emirates'
  UNION ALL SELECT 'AF', 'Afghanistan'
  UNION ALL SELECT 'AG', 'Antigua and Barbuda'
  UNION ALL SELECT 'AI', 'Anguilla'
  UNION ALL SELECT 'AL', 'Albania'
  UNION ALL SELECT 'AM', 'Armenia'
  UNION ALL SELECT 'AO', 'Angola'
  UNION ALL SELECT 'AQ', 'Antarctica'
  UNION ALL SELECT 'AR', 'Argentina'
  UNION ALL SELECT 'AS', 'American Samoa'
  UNION ALL SELECT 'AT', 'Austria'
  UNION ALL SELECT 'AU', 'Australia'
  UNION ALL SELECT 'AW', 'Aruba'
  UNION ALL SELECT 'AX', 'Åland Islands'
  UNION ALL SELECT 'AZ', 'Azerbaijan'
  UNION ALL SELECT 'BA', 'Bosnia and Herzegovina'
  UNION ALL SELECT 'BB', 'Barbados'
  UNION ALL SELECT 'BD', 'Bangladesh'
  UNION ALL SELECT 'BE', 'Belgium'
  UNION ALL SELECT 'BF', 'Burkina Faso'
  UNION ALL SELECT 'BG', 'Bulgaria'
  UNION ALL SELECT 'BH', 'Bahrain'
  UNION ALL SELECT 'BI', 'Burundi'
  UNION ALL SELECT 'BJ', 'Benin'
  UNION ALL SELECT 'BL', 'Saint Barthélemy'
  UNION ALL SELECT 'BM', 'Bermuda'
  UNION ALL SELECT 'BN', 'Brunei'
  UNION ALL SELECT 'BO', 'Bolivia'
  UNION ALL SELECT 'BQ', 'Caribbean Netherlands'
  UNION ALL SELECT 'BR', 'Brazil'
  UNION ALL SELECT 'BS', 'Bahamas'
  UNION ALL SELECT 'BT', 'Bhutan'
  UNION ALL SELECT 'BV', 'Bouvet Island'
  UNION ALL SELECT 'BW', 'Botswana'
  UNION ALL SELECT 'BY', 'Belarus'
  UNION ALL SELECT 'BZ', 'Belize'
  UNION ALL SELECT 'CA', 'Canada'
  UNION ALL SELECT 'CC', 'Cocos Islands'
  UNION ALL SELECT 'CD', 'Democratic Republic of the Congo'
  UNION ALL SELECT 'CF', 'Central African Republic'
  UNION ALL SELECT 'CG', 'Republic of the Congo'
  UNION ALL SELECT 'CH', 'Switzerland'
  UNION ALL SELECT 'CI', 'Côte d''Ivoire'
  UNION ALL SELECT 'CK', 'Cook Islands'
  UNION ALL SELECT 'CL', 'Chile'
  UNION ALL SELECT 'CM', 'Cameroon'
  UNION ALL SELECT 'CN', 'China'
  UNION ALL SELECT 'CO', 'Colombia'
  UNION ALL SELECT 'CR', 'Costa Rica'
  UNION ALL SELECT 'CU', 'Cuba'
  UNION ALL SELECT 'CV', 'Cape Verde'
  UNION ALL SELECT 'CW', 'Curaçao'
  UNION ALL SELECT 'CX', 'Christmas Island'
  UNION ALL SELECT 'CY', 'Cyprus'
  UNION ALL SELECT 'CZ', 'Czech Republic'
  UNION ALL SELECT 'DE', 'Germany'
  UNION ALL SELECT 'DJ', 'Djibouti'
  UNION ALL SELECT 'DK', 'Denmark'
  UNION ALL SELECT 'DM', 'Dominica'
  UNION ALL SELECT 'DO', 'Dominican Republic'
  UNION ALL SELECT 'DZ', 'Algeria'
  UNION ALL SELECT 'EC', 'Ecuador'
  UNION ALL SELECT 'EE', 'Estonia'
  UNION ALL SELECT 'EG', 'Egypt'
  UNION ALL SELECT 'EH', 'Western Sahara'
  UNION ALL SELECT 'ER', 'Eritrea'
  UNION ALL SELECT 'ES', 'Spain'
  UNION ALL SELECT 'ET', 'Ethiopia'
  UNION ALL SELECT 'FI', 'Finland'
  UNION ALL SELECT 'FJ', 'Fiji'
  UNION ALL SELECT 'FK', 'Falkland Islands'
  UNION ALL SELECT 'FM', 'Micronesia'
  UNION ALL SELECT 'FO', 'Faroe Islands'
  UNION ALL SELECT 'FR', 'France'
  UNION ALL SELECT 'GA', 'Gabon'
  UNION ALL SELECT 'GB', 'United Kingdom'
  UNION ALL SELECT 'GD', 'Grenada'
  UNION ALL SELECT 'GE', 'Georgia'
  UNION ALL SELECT 'GF', 'French Guiana'
  UNION ALL SELECT 'GG', 'Guernsey'
  UNION ALL SELECT 'GH', 'Ghana'
  UNION ALL SELECT 'GI', 'Gibraltar'
  UNION ALL SELECT 'GL', 'Greenland'
  UNION ALL SELECT 'GM', 'Gambia'
  UNION ALL SELECT 'GN', 'Guinea'
  UNION ALL SELECT 'GP', 'Guadeloupe'
  UNION ALL SELECT 'GQ', 'Equatorial Guinea'
  UNION ALL SELECT 'GR', 'Greece'
  UNION ALL SELECT 'GS', 'South Georgia and the South Sandwich Islands'
  UNION ALL SELECT 'GT', 'Guatemala'
  UNION ALL SELECT 'GU', 'Guam'
  UNION ALL SELECT 'GW', 'Guinea-Bissau'
  UNION ALL SELECT 'GY', 'Guyana'
  UNION ALL SELECT 'HK', 'Hong Kong'
  UNION ALL SELECT 'HM', 'Heard Island and McDonald Islands'
  UNION ALL SELECT 'HN', 'Honduras'
  UNION ALL SELECT 'HR', 'Croatia'
  UNION ALL SELECT 'HT', 'Haiti'
  UNION ALL SELECT 'HU', 'Hungary'
  UNION ALL SELECT 'ID', 'Indonesia'
  UNION ALL SELECT 'IE', 'Ireland'
  UNION ALL SELECT 'IL', 'Israel'
  UNION ALL SELECT 'IM', 'Isle of Man'
  UNION ALL SELECT 'IN', 'India'
  UNION ALL SELECT 'IO', 'British Indian Ocean Territory'
  UNION ALL SELECT 'IQ', 'Iraq'
  UNION ALL SELECT 'IR', 'Iran'
  UNION ALL SELECT 'IS', 'Iceland'
  UNION ALL SELECT 'IT', 'Italy'
  UNION ALL SELECT 'JE', 'Jersey'
  UNION ALL SELECT 'JM', 'Jamaica'
  UNION ALL SELECT 'JO', 'Jordan'
  UNION ALL SELECT 'JP', 'Japan'
  UNION ALL SELECT 'KE', 'Kenya'
  UNION ALL SELECT 'KG', 'Kyrgyzstan'
  UNION ALL SELECT 'KH', 'Cambodia'
  UNION ALL SELECT 'KI', 'Kiribati'
  UNION ALL SELECT 'KM', 'Comoros'
  UNION ALL SELECT 'KN', 'Saint Kitts and Nevis'
  UNION ALL SELECT 'KP', 'North Korea'
  UNION ALL SELECT 'KR', 'South Korea'
  UNION ALL SELECT 'KW', 'Kuwait'
  UNION ALL SELECT 'KY', 'Cayman Islands'
  UNION ALL SELECT 'KZ', 'Kazakhstan'
  UNION ALL SELECT 'LA', 'Laos'
  UNION ALL SELECT 'LB', 'Lebanon'
  UNION ALL SELECT 'LC', 'Saint Lucia'
  UNION ALL SELECT 'LI', 'Liechtenstein'
  UNION ALL SELECT 'LK', 'Sri Lanka'
  UNION ALL SELECT 'LR', 'Liberia'
  UNION ALL SELECT 'LS', 'Lesotho'
  UNION ALL SELECT 'LT', 'Lithuania'
  UNION ALL SELECT 'LU', 'Luxembourg'
  UNION ALL SELECT 'LV', 'Latvia'
  UNION ALL SELECT 'LY', 'Libya'
  UNION ALL SELECT 'MA', 'Morocco'
  UNION ALL SELECT 'MC', 'Monaco'
  UNION ALL SELECT 'MD', 'Moldova'
  UNION ALL SELECT 'ME', 'Montenegro'
  UNION ALL SELECT 'MF', 'Saint Martin'
  UNION ALL SELECT 'MG', 'Madagascar'
  UNION ALL SELECT 'MH', 'Marshall Islands'
  UNION ALL SELECT 'MK', 'North Macedonia'
  UNION ALL SELECT 'ML', 'Mali'
  UNION ALL SELECT 'MM', 'Myanmar'
  UNION ALL SELECT 'MN', 'Mongolia'
  UNION ALL SELECT 'MO', 'Macao'
  UNION ALL SELECT 'MP', 'Northern Mariana Islands'
  UNION ALL SELECT 'MQ', 'Martinique'
  UNION ALL SELECT 'MR', 'Mauritania'
  UNION ALL SELECT 'MS', 'Montserrat'
  UNION ALL SELECT 'MT', 'Malta'
  UNION ALL SELECT 'MU', 'Mauritius'
  UNION ALL SELECT 'MV', 'Maldives'
  UNION ALL SELECT 'MW', 'Malawi'
  UNION ALL SELECT 'MX', 'Mexico'
  UNION ALL SELECT 'MY', 'Malaysia'
  UNION ALL SELECT 'MZ', 'Mozambique'
  UNION ALL SELECT 'NA', 'Namibia'
  UNION ALL SELECT 'NC', 'New Caledonia'
  UNION ALL SELECT 'NE', 'Niger'
  UNION ALL SELECT 'NF', 'Norfolk Island'
  UNION ALL SELECT 'NG', 'Nigeria'
  UNION ALL SELECT 'NI', 'Nicaragua'
  UNION ALL SELECT 'NL', 'Netherlands'
  UNION ALL SELECT 'NO', 'Norway'
  UNION ALL SELECT 'NP', 'Nepal'
  UNION ALL SELECT 'NR', 'Nauru'
  UNION ALL SELECT 'NU', 'Niue'
  UNION ALL SELECT 'NZ', 'New Zealand'
  UNION ALL SELECT 'OM', 'Oman'
  UNION ALL SELECT 'PA', 'Panama'
  UNION ALL SELECT 'PE', 'Peru'
  UNION ALL SELECT 'PF', 'French Polynesia'
  UNION ALL SELECT 'PG', 'Papua New Guinea'
  UNION ALL SELECT 'PH', 'Philippines'
  UNION ALL SELECT 'PK', 'Pakistan'
  UNION ALL SELECT 'PL', 'Poland'
  UNION ALL SELECT 'PM', 'Saint Pierre and Miquelon'
  UNION ALL SELECT 'PN', 'Pitcairn Islands'
  UNION ALL SELECT 'PR', 'Puerto Rico'
  UNION ALL SELECT 'PS', 'Palestine'
  UNION ALL SELECT 'PT', 'Portugal'
  UNION ALL SELECT 'PW', 'Palau'
  UNION ALL SELECT 'PY', 'Paraguay'
  UNION ALL SELECT 'QA', 'Qatar'
  UNION ALL SELECT 'RE', 'Réunion'
  UNION ALL SELECT 'RO', 'Romania'
  UNION ALL SELECT 'RS', 'Serbia'
  UNION ALL SELECT 'RU', 'Russia'
  UNION ALL SELECT 'RW', 'Rwanda'
  UNION ALL SELECT 'SA', 'Saudi Arabia'
  UNION ALL SELECT 'SB', 'Solomon Islands'
  UNION ALL SELECT 'SC', 'Seychelles'
  UNION ALL SELECT 'SD', 'Sudan'
  UNION ALL SELECT 'SE', 'Sweden'
  UNION ALL SELECT 'SG', 'Singapore'
  UNION ALL SELECT 'SH', 'Saint Helena'
  UNION ALL SELECT 'SI', 'Slovenia'
  UNION ALL SELECT 'SJ', 'Svalbard and Jan Mayen'
  UNION ALL SELECT 'SK', 'Slovakia'
  UNION ALL SELECT 'SL', 'Sierra Leone'
  UNION ALL SELECT 'SM', 'San Marino'
  UNION ALL SELECT 'SN', 'Senegal'
  UNION ALL SELECT 'SO', 'Somalia'
  UNION ALL SELECT 'SR', 'Suriname'
  UNION ALL SELECT 'SS', 'South Sudan'
  UNION ALL SELECT 'ST', 'São Tomé and Príncipe'
  UNION ALL SELECT 'SV', 'El Salvador'
  UNION ALL SELECT 'SX', 'Sint Maarten'
  UNION ALL SELECT 'SY', 'Syria'
  UNION ALL SELECT 'SZ', 'Eswatini'
  UNION ALL SELECT 'TC', 'Turks and Caicos Islands'
  UNION ALL SELECT 'TD', 'Chad'
  UNION ALL SELECT 'TF', 'French Southern Territories'
  UNION ALL SELECT 'TG', 'Togo'
  UNION ALL SELECT 'TH', 'Thailand'
  UNION ALL SELECT 'TJ', 'Tajikistan'
  UNION ALL SELECT 'TK', 'Tokelau'
  UNION ALL SELECT 'TL', 'Timor-Leste'
  UNION ALL SELECT 'TM', 'Turkmenistan'
  UNION ALL SELECT 'TN', 'Tunisia'
  UNION ALL SELECT 'TO', 'Tonga'
  UNION ALL SELECT 'TR', 'Turkey'
  UNION ALL SELECT 'TT', 'Trinidad and Tobago'
  UNION ALL SELECT 'TV', 'Tuvalu'
  UNION ALL SELECT 'TW', 'Taiwan'
  UNION ALL SELECT 'TZ', 'Tanzania'
  UNION ALL SELECT 'UA', 'Ukraine'
  UNION ALL SELECT 'UG', 'Uganda'
  UNION ALL SELECT 'UM', 'United States Minor Outlying Islands'
  UNION ALL SELECT 'US', 'United States'
  UNION ALL SELECT 'UY', 'Uruguay'
  UNION ALL SELECT 'UZ', 'Uzbekistan'
  UNION ALL SELECT 'VA', 'Vatican City'
  UNION ALL SELECT 'VC', 'Saint Vincent and the Grenadines'
  UNION ALL SELECT 'VE', 'Venezuela'
  UNION ALL SELECT 'VG', 'British Virgin Islands'
  UNION ALL SELECT 'VI', 'United States Virgin Islands'
  UNION ALL SELECT 'VN', 'Vietnam'
  UNION ALL SELECT 'VU', 'Vanuatu'
  UNION ALL SELECT 'WF', 'Wallis and Futuna'
  UNION ALL SELECT 'WS', 'Samoa'
  UNION ALL SELECT 'YE', 'Yemen'
  UNION ALL SELECT 'YT', 'Mayotte'
  UNION ALL SELECT 'ZA', 'South Africa'
  UNION ALL SELECT 'ZM', 'Zambia'
  UNION ALL SELECT 'ZW', 'Zimbabwe'
  ORDER BY country_name;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_countries_list() TO authenticated;
