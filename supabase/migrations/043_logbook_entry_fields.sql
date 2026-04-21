-- ============================================================================
-- Migration 043: Logbook entry + draft fields to unify the two systems
-- ============================================================================
-- logbook_entries (from 016) lacked fields the UI always collected (mechanic
-- name / cert / cert type, logbook_type).  maintenance_entry_drafts (from 015)
-- lacked a pointer to the real entry created from it.  This migration adds
-- those columns so draft → entry conversion is lossless.
-- ============================================================================

-- 1. logbook_entries extensions
ALTER TABLE logbook_entries
  ADD COLUMN IF NOT EXISTS logbook_type TEXT,
  ADD COLUMN IF NOT EXISTS mechanic_name TEXT,
  ADD COLUMN IF NOT EXISTS mechanic_cert_number TEXT,
  ADD COLUMN IF NOT EXISTS cert_type TEXT;

-- logbook_type values mirror 014/015: airframe, engine, prop, avionics, multiple
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'logbook_entries_logbook_type_check'
  ) THEN
    ALTER TABLE logbook_entries
      ADD CONSTRAINT logbook_entries_logbook_type_check
      CHECK (logbook_type IS NULL OR logbook_type IN (
        'airframe','engine','prop','avionics','multiple'
      ));
  END IF;
END $$;

-- cert_type: A&P | IA | Repairman (nullable for unsigned entries)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'logbook_entries_cert_type_check'
  ) THEN
    ALTER TABLE logbook_entries
      ADD CONSTRAINT logbook_entries_cert_type_check
      CHECK (cert_type IS NULL OR cert_type IN ('A&P','IA','Repairman'));
  END IF;
END $$;

-- 2. maintenance_entry_drafts: pointer to the resulting logbook entry + status expansion.
-- We keep the existing 'draft','signed','finalized','exported' values but allow
-- 'converted' so we can mark drafts that have been turned into logbook entries
-- without losing the original.
ALTER TABLE maintenance_entry_drafts
  ADD COLUMN IF NOT EXISTS converted_to_entry_id UUID REFERENCES logbook_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_maintenance_entry_drafts_converted
  ON maintenance_entry_drafts(converted_to_entry_id)
  WHERE converted_to_entry_id IS NOT NULL;
