-- Create client_note_views table to track which notes have been viewed by clients
-- This allows showing a "new note" indicator until the client accesses the Notes page
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS client_note_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES company_notes(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, note_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_client_note_views_client_id ON client_note_views(client_id);
CREATE INDEX IF NOT EXISTS idx_client_note_views_note_id ON client_note_views(note_id);
CREATE INDEX IF NOT EXISTS idx_client_note_views_viewed_at ON client_note_views(viewed_at);

-- Add comment to document the table
COMMENT ON TABLE client_note_views IS 'Tracks which company notes have been viewed by each client user. Used to show new note indicators.';
