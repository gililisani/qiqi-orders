-- Add 2FA fields to admins and clients tables
-- This migration adds TOTP secret, recovery codes, and 2FA status

-- Add 2FA fields to admins table
ALTER TABLE admins 
ADD COLUMN IF NOT EXISTS totp_secret TEXT,
ADD COLUMN IF NOT EXISTS recovery_codes TEXT[], -- Array of recovery codes
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_verified_at TIMESTAMP WITH TIME ZONE;

-- Add 2FA fields to clients table  
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS totp_secret TEXT,
ADD COLUMN IF NOT EXISTS recovery_codes TEXT[], -- Array of recovery codes
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_verified_at TIMESTAMP WITH TIME ZONE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_admins_two_factor_enabled ON admins(two_factor_enabled);
CREATE INDEX IF NOT EXISTS idx_clients_two_factor_enabled ON clients(two_factor_enabled);

-- Add comments for documentation
COMMENT ON COLUMN admins.totp_secret IS 'TOTP secret key for 2FA authentication';
COMMENT ON COLUMN admins.recovery_codes IS 'Array of recovery codes for 2FA backup';
COMMENT ON COLUMN admins.two_factor_enabled IS 'Whether 2FA is enabled for this admin';
COMMENT ON COLUMN admins.two_factor_verified_at IS 'When 2FA was last verified';

COMMENT ON COLUMN clients.totp_secret IS 'TOTP secret key for 2FA authentication';
COMMENT ON COLUMN clients.recovery_codes IS 'Array of recovery codes for 2FA backup';
COMMENT ON COLUMN clients.two_factor_enabled IS 'Whether 2FA is enabled for this client';
COMMENT ON COLUMN clients.two_factor_verified_at IS 'When 2FA was last verified';
