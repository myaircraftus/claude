-- 059_clear_document_derived_artifacts_rpc.sql
--
-- Permanent fix for the recurring "Failed to clear OCR entry segments:
-- canceling statement due to statement timeout" error during ingestion
-- retries.
--
-- The TypeScript clearDerivedArtifacts() walks 10+ tables, fetching IDs
-- and deleting in chunked IN-list batches. On big logbook binders
-- (200+ pages, thousands of OCR segments + cascading review items +
-- field candidates) the per-statement timeout kicks in mid-batch and
-- the whole retry fails before ingestion even starts.
--
-- This function does the full cleanup in a single SECURITY DEFINER
-- procedure with a generous local statement_timeout, returning the
-- count of rows deleted from the most-likely-bottleneck tables so the
-- caller can log it.
--
-- The TypeScript path keeps its chunked-delete fallback for the case
-- where this RPC isn't available (older databases, local dev), but on
-- prod every retry now hits the RPC first.

CREATE OR REPLACE FUNCTION public.clear_document_derived_artifacts(
  p_document_id UUID
)
RETURNS TABLE (
  page_jobs_deleted INT,
  segments_deleted INT,
  events_deleted INT,
  chunks_deleted INT,
  embeddings_deleted INT,
  pages_deleted INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page_jobs INT := 0;
  v_segments INT := 0;
  v_events INT := 0;
  v_chunks INT := 0;
  v_embeddings INT := 0;
  v_pages INT := 0;
BEGIN
  -- Bigger budget than Supabase's default 8s — large logbook binders
  -- legitimately need 30-60s of cleanup work before re-ingestion can
  -- start. This is one-shot maintenance, not user-facing read traffic.
  PERFORM set_config('statement_timeout', '180s', true);

  -- 1. Children of OCR entry segments (drop FK references first).
  DELETE FROM review_queue_items
  WHERE ocr_extracted_event_id IN (
    SELECT id FROM ocr_extracted_events
    WHERE ocr_page_job_id IN (
      SELECT id FROM ocr_page_jobs WHERE document_id = p_document_id
    )
  );

  DELETE FROM review_queue_items
  WHERE ocr_entry_segment_id IN (
    SELECT id FROM ocr_entry_segments
    WHERE ocr_page_job_id IN (
      SELECT id FROM ocr_page_jobs WHERE document_id = p_document_id
    )
  );

  DELETE FROM ocr_segment_field_candidates
  WHERE segment_id IN (
    SELECT id FROM ocr_entry_segments
    WHERE ocr_page_job_id IN (
      SELECT id FROM ocr_page_jobs WHERE document_id = p_document_id
    )
  );

  DELETE FROM segment_conflicts
  WHERE segment_id IN (
    SELECT id FROM ocr_entry_segments
    WHERE ocr_page_job_id IN (
      SELECT id FROM ocr_page_jobs WHERE document_id = p_document_id
    )
  );

  -- 2. Children of OCR page jobs.
  DELETE FROM review_queue_items
  WHERE ocr_page_job_id IN (
    SELECT id FROM ocr_page_jobs WHERE document_id = p_document_id
  );

  DELETE FROM extracted_field_candidates
  WHERE page_id IN (
    SELECT id FROM ocr_page_jobs WHERE document_id = p_document_id
  );

  DELETE FROM field_conflicts
  WHERE page_id IN (
    SELECT id FROM ocr_page_jobs WHERE document_id = p_document_id
  );

  -- 3. Now the OCR tables themselves.
  WITH d AS (
    DELETE FROM ocr_extracted_events
    WHERE ocr_page_job_id IN (
      SELECT id FROM ocr_page_jobs WHERE document_id = p_document_id
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_events FROM d;

  WITH d AS (
    DELETE FROM ocr_entry_segments
    WHERE ocr_page_job_id IN (
      SELECT id FROM ocr_page_jobs WHERE document_id = p_document_id
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_segments FROM d;

  WITH d AS (
    DELETE FROM ocr_page_jobs WHERE document_id = p_document_id RETURNING 1
  )
  SELECT COUNT(*) INTO v_page_jobs FROM d;

  -- 4. Document-level derivatives.
  DELETE FROM document_metadata_extractions WHERE document_id = p_document_id;
  DELETE FROM maintenance_events WHERE document_id = p_document_id;

  WITH d AS (
    DELETE FROM document_pages WHERE document_id = p_document_id RETURNING 1
  )
  SELECT COUNT(*) INTO v_pages FROM d;

  DELETE FROM citations WHERE document_id = p_document_id;

  WITH d AS (
    DELETE FROM document_embeddings WHERE document_id = p_document_id RETURNING 1
  )
  SELECT COUNT(*) INTO v_embeddings FROM d;

  WITH d AS (
    DELETE FROM document_chunks WHERE document_id = p_document_id RETURNING 1
  )
  SELECT COUNT(*) INTO v_chunks FROM d;

  -- 5. Canonical store (post-RAG knowledge graph).
  DELETE FROM canonical_document_embeddings WHERE document_id = p_document_id;
  DELETE FROM canonical_document_chunks WHERE document_id = p_document_id;

  RETURN QUERY SELECT v_page_jobs, v_segments, v_events, v_chunks, v_embeddings, v_pages;
END;
$$;

-- Service role calls it (NEVER from a regular user) — the ingestion pipeline
-- is the only legitimate caller. authenticated users cannot delete other
-- users' artifacts because the function is invoked via the service-role key
-- behind the API.
REVOKE ALL ON FUNCTION public.clear_document_derived_artifacts(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_document_derived_artifacts(UUID) TO service_role;

COMMENT ON FUNCTION public.clear_document_derived_artifacts(UUID) IS
  'Atomically clears all derived artifacts for a document (OCR pages/segments/events, chunks, embeddings, pages, citations, canonical store) before re-ingestion. Bumps statement_timeout to 180s for the duration of the call so big logbook binders (1000+ segments, hundreds of pages) cannot be killed mid-cleanup by the default per-statement timeout.';
