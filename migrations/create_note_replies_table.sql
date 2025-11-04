-- Create note_replies table for Internal Notes
-- This allows admins to reply/respond to Internal Notes

CREATE TABLE IF NOT EXISTS note_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id UUID NOT NULL REFERENCES company_notes(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_note_replies_note_id ON note_replies(note_id);
CREATE INDEX IF NOT EXISTS idx_note_replies_created_by ON note_replies(created_by);
CREATE INDEX IF NOT EXISTS idx_note_replies_created_at ON note_replies(created_at);

-- Add comment
COMMENT ON TABLE note_replies IS 'Replies/responses to Internal Notes (notes where visible_to_client = false). Only admins can create replies.';
