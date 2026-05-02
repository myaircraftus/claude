-- Migration 076: Document Expiration & Reminders (Spec 2.6.2)
--
-- Extends the existing documents table with expiration metadata so the
-- platform tracks: registration, airworthiness cert, insurance, A&P
-- cert, IA renewal, hangar lease, etc. — anything with an expiry date.
-- Pure ALTER ADD COLUMN IF NOT EXISTS — no existing field is touched.
-- Coexists with existing fields per "add, don't replace."
--
-- Reminder cross-wire: when a doc is saved with reminder_offsets, the
-- /api/documents/expiring routes enqueue rows in reminder_schedules
-- (sprint 0d) with anchor=expiration_date + negative offset_days.

ALTER TABLE documents
  -- Persona this document belongs to. Matches the persona-aware
  -- categories in the spec ('owner' / 'mechanic' / 'shop').
  ADD COLUMN IF NOT EXISTS target_persona TEXT
    CHECK (target_persona IS NULL OR target_persona IN ('owner', 'mechanic', 'shop')),

  -- Persona-specific category — distinct from doc_type. Free-form
  -- string seeded with the spec lists (Aircraft Registration, A&P
  -- Certificate, Insurance Policy, etc.).
  ADD COLUMN IF NOT EXISTS expiration_category TEXT,

  -- Expiration tracking
  ADD COLUMN IF NOT EXISTS has_expiration BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expiration_date DATE,
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  -- Free-form list of offset specs: [{offset_days: -30, channels: ['in-app','email']}]
  ADD COLUMN IF NOT EXISTS reminder_offsets JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Computed by the recompute helper from expiration_date vs today.
  ADD COLUMN IF NOT EXISTS expiration_status TEXT
    CHECK (expiration_status IS NULL OR expiration_status IN ('current', 'expiring-soon', 'expired')),

  -- Audit / authority
  ADD COLUMN IF NOT EXISTS issued_by TEXT,
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  -- Optional pointer to a renewal task / WO once one is scheduled.
  ADD COLUMN IF NOT EXISTS renewal_tracking_id UUID;

-- Hot path: "expiring soon for org X persona Y" — bounded scan via
-- partial index (only docs that actually have an expiration).
CREATE INDEX IF NOT EXISTS documents_expiration_idx
  ON documents (organization_id, target_persona, expiration_date)
  WHERE has_expiration = TRUE;

-- Status filter index — Dashboard widget calls "WHERE status='expiring-soon' OR 'expired'"
CREATE INDEX IF NOT EXISTS documents_expiration_status_idx
  ON documents (organization_id, expiration_status)
  WHERE has_expiration = TRUE AND expiration_status IS NOT NULL;

-- Per-aircraft expiration list (sub-route /aircraft/[id]/documents)
CREATE INDEX IF NOT EXISTS documents_aircraft_expiration_idx
  ON documents (aircraft_id, expiration_date)
  WHERE has_expiration = TRUE;

COMMENT ON COLUMN documents.target_persona IS 'Spec 2.6.2 — which persona owns this expiring doc (owner/mechanic/shop). Distinct from uploader_role.';
COMMENT ON COLUMN documents.expiration_category IS 'Spec 2.6.2 — regulatory/business category like "Insurance Policy" or "A&P Certificate". Distinct from doc_type.';
COMMENT ON COLUMN documents.expiration_status IS 'Spec 2.6.2 — recomputed from expiration_date vs today: current | expiring-soon (within reminder window) | expired.';
COMMENT ON COLUMN documents.reminder_offsets IS 'Spec 2.6.2 — [{offset_days: -30, channels: ["in-app","email"]}, ...]. On insert/update, /api/documents/expiring enqueues reminder_schedules rows.';
