-- Migration 104: ingestion progress timeline (Phase 13.3)
--
-- Surfaces a per-document timeline of ingestion stages so uploaders can see
-- exactly where their doc is in the pipeline (uploaded → ocr → chunking →
-- text_embedding → vision_render → vision_embedding → indexed). One row per
-- stage transition; the React component (Sprint 13.3) renders the timeline
-- by sorting on stage_started_at.
--
-- Sources of writes (sacred-boundary-respecting):
--   - documents INSERT trigger → 'uploaded' row
--   - documents.parsing_status UPDATE trigger → 'ocr'/'chunking'/'text_embedding'/'indexed'/'failed'
--   - vision_pages INSERT/UPDATE triggers → 'vision_render'/'vision_embedding'/'indexed'
--   - app code can write rows directly via service-role; user clients are
--     read-only via RLS.
--
-- Realtime subscription: the React card subscribes to changes on
-- (organization_id = ?, document_id = ?). Postgres LISTEN/NOTIFY is wired
-- up automatically by Supabase realtime when this table is added to the
-- realtime publication (handled in supabase project setup, not here).

BEGIN;

-- ─── 1. ingestion_progress ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingestion_progress (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id     uuid NOT NULL,
  stage               text NOT NULL,
  stage_started_at    timestamptz NOT NULL DEFAULT NOW(),
  stage_completed_at  timestamptz,
  error_message       text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE ingestion_progress
  DROP CONSTRAINT IF EXISTS ingestion_progress_stage_check;
ALTER TABLE ingestion_progress
  ADD CONSTRAINT ingestion_progress_stage_check CHECK (stage IN (
    'uploaded',
    'ocr',
    'chunking',
    'text_embedding',
    'vision_render',
    'vision_embedding',
    'indexed',
    'failed'
  ));

CREATE INDEX IF NOT EXISTS idx_ingestion_progress_doc
  ON ingestion_progress (document_id, stage_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_progress_org
  ON ingestion_progress (organization_id, stage_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_progress_active
  ON ingestion_progress (stage)
  WHERE stage_completed_at IS NULL;

-- ─── 2. updated_at trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_ingestion_progress_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ingestion_progress_updated_at ON ingestion_progress;
CREATE TRIGGER trg_touch_ingestion_progress_updated_at
  BEFORE UPDATE ON ingestion_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_ingestion_progress_updated_at();

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE ingestion_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ingestion_progress_select" ON ingestion_progress;
CREATE POLICY "ingestion_progress_select" ON ingestion_progress FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));

-- Inserts/updates are service-role only (triggers + app code). No INSERT
-- policy means RLS denies user-session writes by default. That's intentional.

-- ─── 4. Trigger: emit 'uploaded' on documents INSERT ─────────────────────────

CREATE OR REPLACE FUNCTION public.emit_ingestion_progress_uploaded()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO ingestion_progress (
    document_id, organization_id, stage, stage_started_at, stage_completed_at, metadata
  ) VALUES (
    NEW.id, NEW.organization_id, 'uploaded', NOW(), NOW(),
    jsonb_build_object(
      'document_type', NEW.document_type,
      'doc_type', NEW.doc_type,
      'uploaded_by_persona', NEW.uploaded_by_persona,
      'page_count', NEW.page_count
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_ingestion_progress_uploaded ON documents;
CREATE TRIGGER trg_emit_ingestion_progress_uploaded
  AFTER INSERT ON documents
  FOR EACH ROW
  EXECUTE FUNCTION public.emit_ingestion_progress_uploaded();

-- ─── 5. Trigger: mirror documents.parsing_status to ingestion_progress ──────
--
-- Maps the existing parsing_status enum onto the timeline. Sacred-boundary
-- safe: lib/ocr and lib/rag stay untouched; this trigger observes their side
-- effect (parsing_status writes) and emits a parallel timeline.

CREATE OR REPLACE FUNCTION public.emit_ingestion_progress_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_stage text;
BEGIN
  -- Only fire when parsing_status actually changes
  IF OLD.parsing_status IS NOT DISTINCT FROM NEW.parsing_status THEN
    RETURN NEW;
  END IF;

  v_stage := CASE NEW.parsing_status::text
    WHEN 'queued' THEN NULL
    WHEN 'parsing' THEN 'ocr'
    WHEN 'ocr_processing' THEN 'ocr'
    WHEN 'needs_ocr' THEN 'ocr'
    WHEN 'chunking' THEN 'chunking'
    WHEN 'embedding' THEN 'text_embedding'
    WHEN 'completed' THEN 'indexed'
    WHEN 'failed' THEN 'failed'
    ELSE NULL
  END;

  IF v_stage IS NULL THEN
    RETURN NEW;
  END IF;

  -- Close any open prior stage rows for this document so the timeline shows
  -- a clean handoff. Indexed/failed are terminal — also close themselves
  -- after insert to mark the pipeline complete.
  UPDATE ingestion_progress
  SET stage_completed_at = NOW()
  WHERE document_id = NEW.id
    AND stage_completed_at IS NULL;

  INSERT INTO ingestion_progress (
    document_id, organization_id, stage,
    stage_started_at,
    stage_completed_at,
    error_message,
    metadata
  ) VALUES (
    NEW.id, NEW.organization_id, v_stage,
    NOW(),
    -- Indexed/failed are terminal; mark them complete on insert.
    CASE WHEN v_stage IN ('indexed', 'failed') THEN NOW() ELSE NULL END,
    NEW.parse_error,
    jsonb_build_object('parsing_status', NEW.parsing_status::text)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_ingestion_progress_status_change ON documents;
CREATE TRIGGER trg_emit_ingestion_progress_status_change
  AFTER UPDATE OF parsing_status ON documents
  FOR EACH ROW
  EXECUTE FUNCTION public.emit_ingestion_progress_status_change();

-- ─── 6. Trigger: mirror vision_pages stage transitions ──────────────────────
--
-- vision_pages.status: 'pending' → 'embedding' → 'indexed' | 'failed'.
-- We emit one row per (document_id, stage) — first transition wins.
-- The trigger is per-row but only writes the FIRST time a given stage
-- appears for the document, so a 200-page doc doesn't write 200 timeline
-- rows.

CREATE OR REPLACE FUNCTION public.emit_ingestion_progress_vision_page_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_doc_id uuid;
  v_org_id uuid;
  v_stage text;
  v_existing_id uuid;
BEGIN
  -- Only fire on status transitions
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_doc_id := NEW.source_document_id;
  v_org_id := NEW.organization_id;

  IF v_doc_id IS NULL THEN
    RETURN NEW;  -- vision_pages without a parent doc skip the timeline
  END IF;

  v_stage := CASE NEW.status::text
    WHEN 'pending' THEN 'vision_render'
    WHEN 'embedding' THEN 'vision_embedding'
    WHEN 'indexed' THEN 'indexed'
    WHEN 'failed' THEN 'failed'
    ELSE NULL
  END;

  IF v_stage IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotency: only emit if no row for (doc, stage) already exists. Keeps
  -- the timeline crisp regardless of how many vision_pages we have.
  SELECT id INTO v_existing_id
    FROM ingestion_progress
   WHERE document_id = v_doc_id AND stage = v_stage
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- For terminal stages, also close any still-open prior rows.
    IF v_stage IN ('indexed', 'failed') THEN
      UPDATE ingestion_progress
        SET stage_completed_at = COALESCE(stage_completed_at, NOW())
        WHERE document_id = v_doc_id
          AND stage_completed_at IS NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- New stage for this doc — close prior open stages, then insert.
  UPDATE ingestion_progress
  SET stage_completed_at = NOW()
  WHERE document_id = v_doc_id
    AND stage_completed_at IS NULL;

  INSERT INTO ingestion_progress (
    document_id, organization_id, stage,
    stage_started_at,
    stage_completed_at,
    metadata
  ) VALUES (
    v_doc_id, v_org_id, v_stage,
    NOW(),
    CASE WHEN v_stage IN ('indexed', 'failed') THEN NOW() ELSE NULL END,
    jsonb_build_object('vision_page_status', NEW.status::text)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_ingestion_progress_vision_pages ON vision_pages;
CREATE TRIGGER trg_emit_ingestion_progress_vision_pages
  AFTER INSERT OR UPDATE OF status ON vision_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.emit_ingestion_progress_vision_page_change();

-- ─── 7. Done ─────────────────────────────────────────────────────────────────

COMMIT;
