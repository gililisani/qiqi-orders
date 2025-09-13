-- Remove 2FA fields from admins table
ALTER TABLE admins DROP COLUMN IF EXISTS totp_secret;
ALTER TABLE admins DROP COLUMN IF EXISTS recovery_codes;
ALTER TABLE admins DROP COLUMN IF EXISTS two_factor_enabled;
ALTER TABLE admins DROP COLUMN IF EXISTS two_factor_verified_at;

-- Remove 2FA fields from clients table
ALTER TABLE clients DROP COLUMN IF EXISTS totp_secret;
ALTER TABLE clients DROP COLUMN IF EXISTS recovery_codes;
ALTER TABLE clients DROP COLUMN IF EXISTS two_factor_enabled;
ALTER TABLE clients DROP COLUMN IF EXISTS two_factor_verified_at;
