ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS processing_state JSONB NOT NULL DEFAULT '{}'::jsonb;

