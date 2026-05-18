-- Aircraft onboarding lifecycle.
--
-- When an owner adds an aircraft, a detached background job
-- (apps/web/lib/onboarding/onboarding-init.ts) runs pre-initialization:
-- best-effort FAA registry enrichment (make / model / year / serial) and
-- priming the BM25 search index. onboarding_status lets the UI reflect that
-- progress instead of showing a half-set-up aircraft.
--
--   pending    — row created, background job not yet started
--   processing — background pre-init running
--   ready      — pre-init finished (this is the steady state)
--   failed     — pre-init hit an unrecoverable error (still usable)

ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'pending';

ALTER TABLE aircraft DROP CONSTRAINT IF EXISTS aircraft_onboarding_status_check;
ALTER TABLE aircraft ADD CONSTRAINT aircraft_onboarding_status_check
  CHECK (onboarding_status IN ('pending', 'processing', 'ready', 'failed'));

COMMENT ON COLUMN aircraft.onboarding_status IS
  'Background onboarding pre-init lifecycle: pending → processing → ready (or failed). Set by lib/onboarding/onboarding-init.ts.';
