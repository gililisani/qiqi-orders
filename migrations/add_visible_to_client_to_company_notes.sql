-- Add visible_to_client column to company_notes table
-- This allows admins to mark notes as private (only visible to admins) or public (visible to clients)

-- Add the column with default value of true (for backward compatibility)
-- Existing notes will be visible to clients by default
ALTER TABLE company_notes 
ADD COLUMN IF NOT EXISTS visible_to_client BOOLEAN NOT NULL DEFAULT true;

-- Add a comment to document the column
COMMENT ON COLUMN company_notes.visible_to_client IS 'If true, note is visible to clients. If false, note is only visible to admins.';
