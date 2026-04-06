-- Migration 018: Godmode Accuracy Pipeline
-- Multi-engine extraction, field-level arbitration, canonical evidence layer

-- ─── Extend ocr_page_jobs with arbitration state ───────────────────────────────
ALTER TABLE ocr_page_jobs
  ADD COLUMN IF NOT EXISTS arbitration_status    TEXT NOT NULL DEFAULT 'pending'
    CHECK (arbitration_status IN ('pending','auto_accept','accept_with_caution','review_required','reject')),
  ADD COLUMN IF NOT EXISTS arbitration_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS arbitration_reasoning  JSONB,
  ADD COLUMN IF NOT EXISTS engines_run            TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_ocr_pages_arbitration ON ocr_page_jobs(arbitration_status);

-- ─── extraction_runs ───────────────────────────────────────────────────────────
-- Raw output from each extraction engine per page
CREATE TABLE IF NOT EXISTS extraction_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id           UUID NOT NULL REFERENCES ocr_page_jobs(id) ON DELETE CASCADE,
  engine_name       TEXT NOT NULL,   -- 'google_document_ai', 'aws_textract', 'claude_vision', 'pattern_extractor'
  engine_type       TEXT NOT NULL,   -- 'ocr', 'htr', 'vlm', 'deterministic'
  raw_output        JSONB,           -- full raw response from the engine
  structured_output JSONB,           -- parsed/normalised fields
  confidence_summary JSONB,          -- { overall, date, tach, mechanic, ad_refs, ... }
  processing_ms     INT,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extraction_runs_page   ON extraction_runs(page_id);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_engine ON extraction_runs(engine_name);

-- ─── extracted_field_candidates ───────────────────────────────────────────────
-- Per-field candidates from each engine (before arbitration)
CREATE TABLE IF NOT EXISTS extracted_field_candidates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id           UUID NOT NULL REFERENCES ocr_page_jobs(id) ON DELETE CASCADE,
  extraction_run_id UUID REFERENCES extraction_runs(id) ON DELETE CASCADE,
  field_name        TEXT NOT NULL,   -- 'entry_date','tach_time','mechanic_name','ad_reference', etc.
  candidate_value   TEXT,
  source_engine     TEXT NOT NULL,
  raw_confidence    NUMERIC(5,4),
  validation_status TEXT NOT NULL DEFAULT 'unvalidated'
    CHECK (validation_status IN ('unvalidated','valid','invalid','suspicious')),
  validation_notes  TEXT,
  normalized_value  TEXT,            -- after format normalisation
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_candidates_page  ON extracted_field_candidates(page_id);
CREATE INDEX IF NOT EXISTS idx_field_candidates_field ON extracted_field_candidates(field_name);

-- ─── field_conflicts ──────────────────────────────────────────────────────────
-- Where engines disagree materially on a field
CREATE TABLE IF NOT EXISTS field_conflicts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id           UUID NOT NULL REFERENCES ocr_page_jobs(id) ON DELETE CASCADE,
  field_name        TEXT NOT NULL,
  candidate_values  JSONB NOT NULL,  -- array of { engine, value, confidence }
  conflict_reason   TEXT,            -- 'engine_disagreement','validation_failure','ambiguous'
  severity          TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),
  resolution_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (resolution_status IN ('pending','auto_resolved','human_resolved','rejected')),
  resolved_value    TEXT,
  resolved_by       UUID REFERENCES auth.users(id),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_conflicts_page   ON field_conflicts(page_id);
CREATE INDEX IF NOT EXISTS idx_field_conflicts_status ON field_conflicts(resolution_status);

-- ─── maintenance_entry_evidence ───────────────────────────────────────────────
-- Links canonical maintenance_events to the source OCR evidence
CREATE TABLE IF NOT EXISTS maintenance_entry_evidence (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  maintenance_event_id  UUID NOT NULL REFERENCES maintenance_events(id) ON DELETE CASCADE,
  page_id               UUID REFERENCES ocr_page_jobs(id) ON DELETE SET NULL,
  document_id           UUID REFERENCES documents(id) ON DELETE SET NULL,
  snippet               TEXT,            -- relevant text snippet from the page
  bounding_box          JSONB,           -- { x, y, width, height, page } if available
  source_engine         TEXT,
  confidence            NUMERIC(5,4),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entry_evidence_event ON maintenance_entry_evidence(maintenance_event_id);
CREATE INDEX IF NOT EXISTS idx_entry_evidence_page  ON maintenance_entry_evidence(page_id);

-- ─── Extend maintenance_events with canonicalisation fields ───────────────────
ALTER TABLE maintenance_events
  ADD COLUMN IF NOT EXISTS canonicalization_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (canonicalization_status IN ('draft','canonical','superseded','rejected')),
  ADD COLUMN IF NOT EXISTS source_page_id         UUID REFERENCES ocr_page_jobs(id),
  ADD COLUMN IF NOT EXISTS review_task_id         UUID REFERENCES review_queue_items(id),
  ADD COLUMN IF NOT EXISTS tsmoh                  NUMERIC(10,1),
  ADD COLUMN IF NOT EXISTS return_to_service      BOOLEAN,
  ADD COLUMN IF NOT EXISTS ata_chapter            TEXT,
  ADD COLUMN IF NOT EXISTS part_numbers           JSONB,
  ADD COLUMN IF NOT EXISTS far_references         JSONB,
  ADD COLUMN IF NOT EXISTS repair_station_cert    TEXT,
  ADD COLUMN IF NOT EXISTS ia_cert_number         TEXT,
  ADD COLUMN IF NOT EXISTS record_confidence      NUMERIC(5,4);

CREATE INDEX IF NOT EXISTS idx_maintenance_canonical ON maintenance_events(canonicalization_status);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE extraction_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_field_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_conflicts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_entry_evidence ENABLE ROW LEVEL SECURITY;

-- extraction_runs: join through page → document → org
CREATE POLICY "org_extraction_runs" ON extraction_runs FOR ALL USING (
  page_id IN (
    SELECT id FROM ocr_page_jobs
    WHERE organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  )
);

CREATE POLICY "org_field_candidates" ON extracted_field_candidates FOR ALL USING (
  page_id IN (
    SELECT id FROM ocr_page_jobs
    WHERE organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  )
);

CREATE POLICY "org_field_conflicts" ON field_conflicts FOR ALL USING (
  page_id IN (
    SELECT id FROM ocr_page_jobs
    WHERE organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  )
);

CREATE POLICY "org_entry_evidence" ON maintenance_entry_evidence FOR ALL USING (
  maintenance_event_id IN (
    SELECT id FROM maintenance_events
    WHERE organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  )
);
