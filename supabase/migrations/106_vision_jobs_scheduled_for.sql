-- Migration 106: Phase 14 tier-aware dispatch — vision_index_jobs.scheduled_for
--
-- Adds the column the auto-dispatch helper (and queue worker) read to
-- decide whether a job is ready to process. Pro/Beta orgs get
-- scheduled_for=NOW(); Standard orgs get next 02:00 UTC; large docs
-- (>200 pages) always get next 02:00 UTC regardless of tier.
--
-- Backfill: existing rows get scheduled_for=created_at so they're all
-- "ready now" — no work waiting.

BEGIN;

ALTER TABLE vision_index_jobs
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN vision_index_jobs.scheduled_for IS
  'Phase 14: when this job becomes eligible for processing. The queue worker filters status=''queued'' AND scheduled_for <= NOW(). Standard tier docs get scheduled_for=next 02:00 UTC; Pro/Beta get NOW(); >200-page docs always batch.';

-- Index supporting the queue puller's "queued AND ready" filter.
CREATE INDEX IF NOT EXISTS idx_vision_jobs_queued_scheduled
  ON vision_index_jobs (scheduled_for)
  WHERE status = 'queued';

-- Backfill: existing rows are immediately processable (preserves
-- behavior — no jobs get suddenly delayed by the new column).
UPDATE vision_index_jobs
SET scheduled_for = COALESCE(scheduled_for, created_at, NOW())
WHERE scheduled_for IS NULL;

COMMIT;
