-- Migration 022: Scanner System (Mobile Capture + Batching + Classification)
-- Scanner tables (scan_sessions, scan_batches, scan_pages, evidence_captures,
-- scan_batch_events) pre-exist from an earlier iteration. This migration is
-- defensive/idempotent: it only ensures the scanner role is allowed, enables
-- RLS, and installs the policies we need for the scanner UI.
-- See: mark downs/13. myaircraft_scanner_master_markdown.md

-- ============================================================
-- 1. Add scanner role to organization_memberships check constraint
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_memberships_role_check'
  ) THEN
    ALTER TABLE organization_memberships DROP CONSTRAINT organization_memberships_role_check;
  END IF;
  ALTER TABLE organization_memberships
    ADD CONSTRAINT organization_memberships_role_check
    CHECK (role IN ('owner','admin','mechanic','viewer','auditor','pilot','scanner'));
EXCEPTION WHEN others THEN
  -- If constraint can't be added (existing bad data), just skip
  RAISE NOTICE 'Could not update role check: %', SQLERRM;
END $$;

-- ============================================================
-- 2. Ensure all scanner tables exist (create if absent)
-- ============================================================
CREATE TABLE IF NOT EXISTS scan_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scanner_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  device_type       TEXT,
  device_metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scan_batches (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id        UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  scanner_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id         UUID REFERENCES scan_sessions(id) ON DELETE SET NULL,
  batch_type         TEXT NOT NULL DEFAULT 'unknown',
  source_mode        TEXT NOT NULL DEFAULT 'batch',
  title              TEXT,
  notes              TEXT,
  page_count         INT NOT NULL DEFAULT 0,
  batch_pdf_path     TEXT,
  document_id        UUID,
  status             TEXT NOT NULL DEFAULT 'capturing',
  submitted_at       TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scan_pages (
  id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_batch_id                   UUID NOT NULL REFERENCES scan_batches(id) ON DELETE CASCADE,
  organization_id                 UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id                     UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  page_number                     INT NOT NULL,
  original_image_path             TEXT,
  processed_capture_image_path    TEXT,
  capture_quality_score           NUMERIC(5,2),
  capture_warnings                TEXT[],
  capture_classification          TEXT,
  user_marked_unreadable          BOOLEAN NOT NULL DEFAULT false,
  low_quality_override            BOOLEAN NOT NULL DEFAULT false,
  upload_status                   TEXT NOT NULL DEFAULT 'pending',
  processing_status               TEXT NOT NULL DEFAULT 'queued',
  ocr_page_job_id                 UUID,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_captures (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id               UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  created_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  evidence_type             TEXT,
  chosen_storage_target     TEXT,
  related_work_order_id     UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  related_job_id            UUID,
  scan_batch_id             UUID REFERENCES scan_batches(id) ON DELETE SET NULL,
  image_path                TEXT,
  document_id               UUID,
  suggested_action          TEXT,
  action_taken              TEXT,
  status                    TEXT DEFAULT 'captured',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scan_batch_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_batch_id     UUID NOT NULL REFERENCES scan_batches(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. Indexes (all idempotent)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_scan_sessions_org    ON scan_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_scan_batches_org     ON scan_batches(organization_id);
CREATE INDEX IF NOT EXISTS idx_scan_batches_aircraft ON scan_batches(aircraft_id) WHERE aircraft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scan_batches_status  ON scan_batches(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_scan_batches_created ON scan_batches(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_pages_batch     ON scan_pages(scan_batch_id, page_number);
CREATE INDEX IF NOT EXISTS idx_scan_pages_org       ON scan_pages(organization_id);
CREATE INDEX IF NOT EXISTS idx_evidence_org         ON evidence_captures(organization_id);
CREATE INDEX IF NOT EXISTS idx_evidence_aircraft    ON evidence_captures(aircraft_id) WHERE aircraft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_evidence_wo          ON evidence_captures(related_work_order_id) WHERE related_work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scan_batch_events_batch ON scan_batch_events(scan_batch_id, created_at DESC);

-- ============================================================
-- 4. RLS policies (enable + (re)create)
-- ============================================================
ALTER TABLE scan_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scan_sessions_select" ON scan_sessions;
DROP POLICY IF EXISTS "scan_sessions_insert" ON scan_sessions;
DROP POLICY IF EXISTS "scan_sessions_update" ON scan_sessions;
CREATE POLICY "scan_sessions_select" ON scan_sessions FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "scan_sessions_insert" ON scan_sessions FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "scan_sessions_update" ON scan_sessions FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));

ALTER TABLE scan_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scan_batches_select" ON scan_batches;
DROP POLICY IF EXISTS "scan_batches_insert" ON scan_batches;
DROP POLICY IF EXISTS "scan_batches_update" ON scan_batches;
DROP POLICY IF EXISTS "scan_batches_delete" ON scan_batches;
CREATE POLICY "scan_batches_select" ON scan_batches FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "scan_batches_insert" ON scan_batches FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "scan_batches_update" ON scan_batches FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "scan_batches_delete" ON scan_batches FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner','admin']));

ALTER TABLE scan_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scan_pages_select" ON scan_pages;
DROP POLICY IF EXISTS "scan_pages_insert" ON scan_pages;
DROP POLICY IF EXISTS "scan_pages_update" ON scan_pages;
DROP POLICY IF EXISTS "scan_pages_delete" ON scan_pages;
CREATE POLICY "scan_pages_select" ON scan_pages FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "scan_pages_insert" ON scan_pages FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "scan_pages_update" ON scan_pages FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "scan_pages_delete" ON scan_pages FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner','admin']));

ALTER TABLE evidence_captures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "evidence_captures_select" ON evidence_captures;
DROP POLICY IF EXISTS "evidence_captures_insert" ON evidence_captures;
DROP POLICY IF EXISTS "evidence_captures_update" ON evidence_captures;
DROP POLICY IF EXISTS "evidence_captures_delete" ON evidence_captures;
CREATE POLICY "evidence_captures_select" ON evidence_captures FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "evidence_captures_insert" ON evidence_captures FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "evidence_captures_update" ON evidence_captures FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "evidence_captures_delete" ON evidence_captures FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner','admin']));

-- scan_batch_events has no organization_id column; derive org via batch join
ALTER TABLE scan_batch_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scan_batch_events_select" ON scan_batch_events;
DROP POLICY IF EXISTS "scan_batch_events_insert" ON scan_batch_events;
CREATE POLICY "scan_batch_events_select" ON scan_batch_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM scan_batches b
    WHERE b.id = scan_batch_events.scan_batch_id
      AND b.organization_id = ANY(get_my_org_ids())
  ));
CREATE POLICY "scan_batch_events_insert" ON scan_batch_events FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM scan_batches b
    WHERE b.id = scan_batch_events.scan_batch_id
      AND b.organization_id = ANY(get_my_org_ids())
  ));

-- ============================================================
-- 5. updated_at trigger on scan_batches
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at_scan_batches()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scan_batches_updated ON scan_batches;
CREATE TRIGGER trg_scan_batches_updated
  BEFORE UPDATE ON scan_batches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_scan_batches();

-- ============================================================
-- 6. Storage bucket for scanner captures
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('scanner-captures', 'scanner-captures', false)
ON CONFLICT (id) DO NOTHING;
