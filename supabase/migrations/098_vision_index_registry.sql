-- Sprint 8.1 — Vision Index Registry (Phase 8 Foundation).
--
-- Tracks every page-level vision-indexed image, separate from the existing
-- `documents` table which is owned by the OCR/text-RAG pipeline (sacred —
-- 351 docs / 234k embeddings, do NOT touch).
--
-- Two tables here:
--   vision_pages       — one row per (source_document × page_number).
--                        State machine: pending → rendering → embedding
--                        → indexed (terminal happy path).
--                        failed (terminal sad path), review_required
--                        (terminal — needs human triage).
--   vision_index_jobs  — GPU worker queue. Each job is a batch of
--                        vision_page_ids dispatched in one GPU run.
--
-- Foreign keys:
--   - source_document_id is intentionally NOT a FK to `documents`. The
--     documents table is owned by the existing pipeline (migration 004);
--     this Phase 8 module is a parallel index, not a join. Treating it
--     as a soft reference keeps the sacred boundary clean.
--   - vision_index_jobs.vision_page_ids[] is a uuid[] (no FK). Each job
--     dispatches a snapshot of pages; soft-deletion of a vision_page
--     between job-create and job-run is expected and non-fatal.
--
-- Soft-delete:
--   vision_pages CAN have deleted_at — Phase 8 is mutable per its own
--   admin workflow (re-render, re-embed, retire bad pages). Contrast
--   with `aircraft` which has no deleted_at (status='retired' instead),
--   per the migration 091 lesson that the telemetry crons learned the
--   hard way.

CREATE TABLE IF NOT EXISTS vision_pages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_document_id  uuid NOT NULL,
  page_number         int NOT NULL,
  page_image_path     text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','rendering','embedding','indexed','failed','review_required')),
  vision_model        text,
  vision_index_id     text,
  confidence_score    numeric,
  error_message       text,
  rendered_at         timestamptz,
  embedded_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

-- One vision_pages row per (source_document, page_number, organization)
-- prevents accidental duplicate renders. We don't include deleted_at in
-- the unique key so re-rendering a soft-deleted page produces an error
-- (operator must hard-clear or update the existing row).
CREATE UNIQUE INDEX IF NOT EXISTS vision_pages_doc_page_unique
  ON vision_pages (organization_id, source_document_id, page_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vision_pages_org_status_idx
  ON vision_pages (organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vision_pages_doc_idx
  ON vision_pages (source_document_id, page_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vision_pages_index_id_idx
  ON vision_pages (vision_index_id)
  WHERE vision_index_id IS NOT NULL;

ALTER TABLE vision_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read vision_pages" ON vision_pages;
CREATE POLICY "Org members read vision_pages"
  ON vision_pages FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- Vision indexing is admin-only work. Mechanics + owners read, admins write.
DROP POLICY IF EXISTS "Admin write vision_pages" ON vision_pages;
CREATE POLICY "Admin write vision_pages"
  ON vision_pages FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND role IN ('owner','admin')
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND role IN ('owner','admin')
  ));

-- ─── vision_index_jobs ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vision_index_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vision_page_ids     uuid[] NOT NULL,
  status              text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed')),
  gpu_host            text
    CHECK (gpu_host IS NULL OR gpu_host IN ('modal','replicate','runpod','colab','stub')),
  model_used          text,
  started_at          timestamptz,
  completed_at        timestamptz,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vision_index_jobs_org_status_idx
  ON vision_index_jobs (organization_id, status);

CREATE INDEX IF NOT EXISTS vision_index_jobs_recent_idx
  ON vision_index_jobs (created_at DESC);

ALTER TABLE vision_index_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read vision_index_jobs" ON vision_index_jobs;
CREATE POLICY "Org members read vision_index_jobs"
  ON vision_index_jobs FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

DROP POLICY IF EXISTS "Admin write vision_index_jobs" ON vision_index_jobs;
CREATE POLICY "Admin write vision_index_jobs"
  ON vision_index_jobs FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND role IN ('owner','admin')
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND role IN ('owner','admin')
  ));

-- ─── updated_at triggers ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_vision_pages_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vision_pages_set_updated_at ON vision_pages;
CREATE TRIGGER vision_pages_set_updated_at
  BEFORE UPDATE ON vision_pages
  FOR EACH ROW EXECUTE FUNCTION trg_vision_pages_set_updated_at();

CREATE OR REPLACE FUNCTION trg_vision_index_jobs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vision_index_jobs_set_updated_at ON vision_index_jobs;
CREATE TRIGGER vision_index_jobs_set_updated_at
  BEFORE UPDATE ON vision_index_jobs
  FOR EACH ROW EXECUTE FUNCTION trg_vision_index_jobs_set_updated_at();

-- ─── Comments ─────────────────────────────────────────────────────────

COMMENT ON TABLE  vision_pages IS 'Page-level vision index registry (Phase 8 Sprint 8.1). Parallel to documents/text-RAG.';
COMMENT ON COLUMN vision_pages.source_document_id IS 'Soft reference to documents.id — intentionally NOT a FK to keep the sacred OCR/RAG pipeline boundary clean.';
COMMENT ON COLUMN vision_pages.page_image_path IS 'Path in supabase storage bucket vision-pages: {organization_id}/{source_document_id}/page_{page_number}.png';
COMMENT ON COLUMN vision_pages.status IS 'pending → rendering → embedding → indexed | failed | review_required.';
COMMENT ON COLUMN vision_pages.vision_index_id IS 'Set when status=indexed. Foreign key into vision_embeddings (sprint 8.4).';

COMMENT ON TABLE  vision_index_jobs IS 'GPU worker job queue (Phase 8 Sprint 8.1). One job = one batch of vision_pages dispatched together.';
COMMENT ON COLUMN vision_index_jobs.vision_page_ids IS 'Snapshot of page IDs at job creation. Soft-deletion of a page mid-job is non-fatal — worker skips missing pages.';
COMMENT ON COLUMN vision_index_jobs.gpu_host IS 'Which GPU service handled the job. Stub mode emits gpu_host=stub.';
