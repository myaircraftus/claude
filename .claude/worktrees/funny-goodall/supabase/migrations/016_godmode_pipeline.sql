-- ============================================================
-- 016_godmode_pipeline.sql
-- Multi-engine extraction, arbitration, canonical truth layer
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Extend ocr_page_jobs with arbitration + preprocessing cols
-- ────────────────────────────────────────────────────────────
ALTER TABLE ocr_page_jobs
  ADD COLUMN IF NOT EXISTS page_quality_score      NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS preprocessing_metadata  JSONB,
  ADD COLUMN IF NOT EXISTS arbitration_result      TEXT, -- 'auto_accept','accept_with_caution','review_required','reject'
  ADD COLUMN IF NOT EXISTS arbitration_score       NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS arbitration_metadata    JSONB,
  ADD COLUMN IF NOT EXISTS neighbor_context_used   BOOLEAN NOT NULL DEFAULT FALSE;

-- ────────────────────────────────────────────────────────────
-- 2. extraction_runs — raw output from each engine per page
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS extraction_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ocr_page_job_id   UUID NOT NULL REFERENCES ocr_page_jobs(id) ON DELETE CASCADE,
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engine_name       TEXT NOT NULL,  -- 'tesseract','gpt4o_vision','gpt4o_vlm','regex_patterns'
  engine_type       TEXT NOT NULL,  -- 'ocr','htr','vlm','rule_based'
  raw_text          TEXT,
  raw_output        JSONB,          -- full structured output from the engine
  confidence_score  NUMERIC(5,4),
  token_count       INT,
  processing_ms     INT,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_page    ON extraction_runs(ocr_page_job_id);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_doc     ON extraction_runs(document_id);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_engine  ON extraction_runs(engine_name);

-- ────────────────────────────────────────────────────────────
-- 3. extracted_field_candidates — per-field candidates from each engine
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS extracted_field_candidates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ocr_page_job_id   UUID NOT NULL REFERENCES ocr_page_jobs(id) ON DELETE CASCADE,
  extraction_run_id UUID REFERENCES extraction_runs(id) ON DELETE SET NULL,
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_name        TEXT NOT NULL,  -- 'entry_date','tach_time','total_time','mechanic_name','ap_cert','ia_cert','ad_reference','part_number','work_description','return_to_service','inspection_type'
  raw_value         TEXT,
  normalized_value  TEXT,
  source_engine     TEXT NOT NULL,
  confidence        NUMERIC(5,4),
  validation_status TEXT NOT NULL DEFAULT 'pending', -- 'pending','valid','invalid','suspicious'
  validation_notes  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_field_candidates_page   ON extracted_field_candidates(ocr_page_job_id);
CREATE INDEX IF NOT EXISTS idx_field_candidates_field  ON extracted_field_candidates(field_name);
CREATE INDEX IF NOT EXISTS idx_field_candidates_engine ON extracted_field_candidates(source_engine);

-- ────────────────────────────────────────────────────────────
-- 4. field_conflicts — disagreements between engine outputs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_conflicts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ocr_page_job_id   UUID NOT NULL REFERENCES ocr_page_jobs(id) ON DELETE CASCADE,
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_name        TEXT NOT NULL,
  candidate_values  JSONB NOT NULL,  -- array of {engine, value, confidence}
  conflict_reason   TEXT,
  severity          TEXT NOT NULL DEFAULT 'low',  -- 'low','medium','high','critical'
  resolution_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending','resolved','overridden'
  resolved_value    TEXT,
  resolved_by       UUID REFERENCES auth.users(id),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_field_conflicts_page     ON field_conflicts(ocr_page_job_id);
CREATE INDEX IF NOT EXISTS idx_field_conflicts_status   ON field_conflicts(resolution_status);
CREATE INDEX IF NOT EXISTS idx_field_conflicts_severity ON field_conflicts(severity);

-- ────────────────────────────────────────────────────────────
-- 5. canonical_maintenance_entries — approved truth records only
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canonical_maintenance_entries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id         UUID REFERENCES aircraft(id),
  document_id         UUID REFERENCES documents(id) ON DELETE SET NULL,
  ocr_page_job_id     UUID REFERENCES ocr_page_jobs(id) ON DELETE SET NULL,
  source_page_number  INT,

  -- Normalized fields
  logbook_type        TEXT,   -- 'airframe','engine','prop','avionics'
  entry_date          DATE,
  tach_time           NUMERIC(10,1),
  total_time_airframe NUMERIC(10,1),
  tsoh                NUMERIC(10,1),   -- time since overhaul
  tsmoh               NUMERIC(10,1),   -- time since major overhaul
  ett                 NUMERIC(10,1),   -- engine total time
  work_description    TEXT,
  work_type           TEXT,
  ata_chapter         TEXT,
  mechanic_name       TEXT,
  ap_cert_number      TEXT,
  ia_cert_number      TEXT,
  repair_station_cert TEXT,
  return_to_service   BOOLEAN,
  rts_statement       TEXT,
  part_numbers        JSONB,
  serial_numbers      JSONB,
  ad_references       JSONB,
  far_references      JSONB,
  manual_references   JSONB,
  inspection_type     TEXT,   -- 'annual','100hr','progressive','ad_compliance','other'

  -- Provenance & quality
  confidence_overall  NUMERIC(5,4),
  review_status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending','auto_accepted','human_approved','rejected'
  approved_by         UUID REFERENCES auth.users(id),
  approved_at         TIMESTAMPTZ,
  reviewer_notes      TEXT,

  -- Links
  linked_maintenance_event_id UUID REFERENCES maintenance_events(id),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_canonical_entries_org       ON canonical_maintenance_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_canonical_entries_aircraft  ON canonical_maintenance_entries(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_canonical_entries_status    ON canonical_maintenance_entries(review_status);
CREATE INDEX IF NOT EXISTS idx_canonical_entries_date      ON canonical_maintenance_entries(entry_date);

-- ────────────────────────────────────────────────────────────
-- 6. canonical_entry_evidence — evidence linking canonical records to source
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canonical_entry_evidence (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_entry_id        UUID NOT NULL REFERENCES canonical_maintenance_entries(id) ON DELETE CASCADE,
  ocr_page_job_id           UUID REFERENCES ocr_page_jobs(id) ON DELETE SET NULL,
  extraction_run_id         UUID REFERENCES extraction_runs(id) ON DELETE SET NULL,
  document_id               UUID REFERENCES documents(id) ON DELETE SET NULL,
  page_number               INT,
  evidence_text             TEXT,
  field_name                TEXT,
  source_engine             TEXT,
  confidence                NUMERIC(5,4),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_canonical_evidence_entry ON canonical_entry_evidence(canonical_entry_id);
CREATE INDEX IF NOT EXISTS idx_canonical_evidence_page  ON canonical_entry_evidence(ocr_page_job_id);

-- ────────────────────────────────────────────────────────────
-- 7. Extend review_queue_items with structured review packet
-- ────────────────────────────────────────────────────────────
ALTER TABLE review_queue_items
  ADD COLUMN IF NOT EXISTS review_packet          JSONB,  -- structured packet: all engine outputs, conflicts, recommendations
  ADD COLUMN IF NOT EXISTS arbitration_result     TEXT,
  ADD COLUMN IF NOT EXISTS arbitration_score      NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS conflict_count         INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS critical_fields_count  INT NOT NULL DEFAULT 0;

-- ────────────────────────────────────────────────────────────
-- 8. RLS policies
-- ────────────────────────────────────────────────────────────
ALTER TABLE extraction_runs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_field_candidates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_conflicts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_maintenance_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_entry_evidence       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_extraction_runs" ON extraction_runs FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
);
CREATE POLICY "org_field_candidates" ON extracted_field_candidates FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
);
CREATE POLICY "org_field_conflicts" ON field_conflicts FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
);
CREATE POLICY "org_canonical_entries" ON canonical_maintenance_entries FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
);
CREATE POLICY "org_canonical_evidence" ON canonical_entry_evidence FOR ALL USING (
  EXISTS (
    SELECT 1 FROM canonical_maintenance_entries cme
    JOIN organization_memberships om ON om.organization_id = cme.organization_id
    WHERE cme.id = canonical_entry_evidence.canonical_entry_id
      AND om.user_id = auth.uid()
      AND om.accepted_at IS NOT NULL
  )
);
