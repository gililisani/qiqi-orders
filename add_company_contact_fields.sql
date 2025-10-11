-- Migration: Add company contact and address fields
-- This migration adds new fields to the companies table for better contact management

-- Add company-level information fields
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS company_address TEXT,
ADD COLUMN IF NOT EXISTS company_email TEXT,
ADD COLUMN IF NOT EXISTS company_phone TEXT,
ADD COLUMN IF NOT EXISTS company_tax_number TEXT;

-- Add ship-to contact fields (breaking down ship_to_address into more granular fields)
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS ship_to_contact_name TEXT,
ADD COLUMN IF NOT EXISTS ship_to_contact_email TEXT,
ADD COLUMN IF NOT EXISTS ship_to_contact_phone TEXT;

-- Add comments for documentation
COMMENT ON COLUMN companies.company_address IS 'Company main address';
COMMENT ON COLUMN companies.company_email IS 'Company main email address';
COMMENT ON COLUMN companies.company_phone IS 'Company main phone number';
COMMENT ON COLUMN companies.company_tax_number IS 'Company tax/VAT number';
COMMENT ON COLUMN companies.ship_to_contact_name IS 'Shipping contact person name';
COMMENT ON COLUMN companies.ship_to_contact_email IS 'Shipping contact email';
COMMENT ON COLUMN companies.ship_to_contact_phone IS 'Shipping contact phone number';

