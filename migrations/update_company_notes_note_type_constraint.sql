-- Update the note_type check constraint to include new note types
-- This allows: meeting, webinar, event, feedback, general_note, internal_note

-- First, drop the existing constraint if it exists
ALTER TABLE company_notes 
DROP CONSTRAINT IF EXISTS company_notes_note_type_check;

-- Add the new constraint with all allowed note types
ALTER TABLE company_notes 
ADD CONSTRAINT company_notes_note_type_check 
CHECK (note_type IN ('meeting', 'webinar', 'event', 'feedback', 'general_note', 'internal_note'));
