-- Add password_changed field to clients table
-- This tracks whether a user has changed their initial temporary password

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS password_changed BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN clients.password_changed IS 'Tracks whether user has changed their initial temporary password. False for new users until first password change.';

-- Update existing users to true (assume they've already changed passwords)
UPDATE clients
SET password_changed = true
WHERE password_changed IS NULL OR password_changed = false;

