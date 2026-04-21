-- Allow tracking which squawks were rolled into an estimate
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS linked_squawk_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_estimates_squawk_ids
  ON estimates USING GIN (linked_squawk_ids)
  WHERE linked_squawk_ids IS NOT NULL AND array_length(linked_squawk_ids, 1) > 0;
