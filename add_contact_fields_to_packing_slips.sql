-- Add contact fields to packing_slips table
ALTER TABLE packing_slips 
ADD COLUMN contact_name TEXT,
ADD COLUMN contact_email TEXT,
ADD COLUMN contact_phone TEXT,
ADD COLUMN vat_number TEXT;

-- Add comments for documentation
COMMENT ON COLUMN packing_slips.contact_name IS 'Contact person name for shipping';
COMMENT ON COLUMN packing_slips.contact_email IS 'Contact person email for shipping';
COMMENT ON COLUMN packing_slips.contact_phone IS 'Contact person phone number for shipping';
COMMENT ON COLUMN packing_slips.vat_number IS 'VAT number for shipping documentation';
