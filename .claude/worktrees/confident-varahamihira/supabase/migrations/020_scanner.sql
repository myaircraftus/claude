-- Migration 020: Scanner
-- Adds scan_batches and scan_pages tables for the in-app scanner workflow.
-- Supports batch logbook scanning and one-off evidence capture.

-- ============================================================
-- 1. SCAN BATCHES
-- One record per submitted scan job (batch or evidence capture)
-- ============================================================
CREATE TABLE IF NOT EXISTS scan_batches (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id         UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  scanner_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_mode         TEXT NOT NULL DEFAULT 'batch'
                      CHECK (source_mode IN ('batch', 'evidence')),
  batch_type          TEXT NOT NULL DEFAULT 'unknown',
  title               TEXT NOT NULL,
  page_count          INT NOT NULL DEFAULT 0,
  batch_pdf_path      TEXT,
  status              TEXT NOT NULL DEFAULT 'uploading'
                      CHECK (status IN (
                        'uploading', 'uploaded', 'partial',
                        'processing', 'review_required',
                        'completed', 'failed'
                      )),
  submitted_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scan_batches_org        ON scan_batches(organization_id);
CREATE INDEX idx_scan_batches_aircraft   ON scan_batches(aircraft_id) WHERE aircraft_id IS NOT NULL;
CREATE INDEX idx_scan_batches_user       ON scan_batches(scanner_user_id) WHERE scanner_user_id IS NOT NULL;
CREATE INDEX idx_scan_batches_status     ON scan_batches(organization_id, status);
CREATE INDEX idx_scan_batches_created    ON scan_batches(organization_id, created_at DESC);

ALTER TABLE scan_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scan_batches_select" ON scan_batches FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "scan_batches_insert" ON scan_batches FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "scan_batches_update" ON scan_batches FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

CREATE TRIGGER trg_scan_batches_updated_at
  BEFORE UPDATE ON scan_batches
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- 2. SCAN PAGES
-- One record per captured page within a batch
-- ============================================================
CREATE TABLE IF NOT EXISTS scan_pages (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_batch_id               UUID NOT NULL REFERENCES scan_batches(id) ON DELETE CASCADE,
  page_number                 INT NOT NULL,
  original_image_path         TEXT,
  processed_capture_image_path TEXT,
  capture_quality_score       NUMERIC(5,4),
  capture_warnings            TEXT[],
  capture_classification      TEXT,
  user_marked_unreadable      BOOLEAN NOT NULL DEFAULT FALSE,
  upload_status               TEXT NOT NULL DEFAULT 'pending'
                              CHECK (upload_status IN ('pending', 'uploaded', 'failed')),
  processing_status           TEXT NOT NULL DEFAULT 'pending'
                              CHECK (processing_status IN (
                                'pending', 'processing', 'completed',
                                'review_required', 'failed'
                              )),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scan_pages_batch   ON scan_pages(scan_batch_id, page_number);
CREATE INDEX idx_scan_pages_status  ON scan_pages(processing_status);

ALTER TABLE scan_pages ENABLE ROW LEVEL SECURITY;

-- Pages inherit org access via their batch
CREATE POLICY "scan_pages_select" ON scan_pages FOR SELECT
  USING (
    scan_batch_id IN (
      SELECT id FROM scan_batches
      WHERE organization_id = ANY(get_my_org_ids())
    )
  );
CREATE POLICY "scan_pages_insert" ON scan_pages FOR INSERT
  WITH CHECK (
    scan_batch_id IN (
      SELECT id FROM scan_batches
      WHERE organization_id = ANY(get_my_org_ids())
    )
  );
CREATE POLICY "scan_pages_update" ON scan_pages FOR UPDATE
  USING (
    scan_batch_id IN (
      SELECT id FROM scan_batches
      WHERE organization_id = ANY(get_my_org_ids())
    )
  );
