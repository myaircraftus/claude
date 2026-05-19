-- Performance — add covering indexes for foreign-key columns on the high-row,
-- hot-path tables that are demonstrably joined/filtered by these columns
-- (the RAG document layer, the OCR pipeline, and the admin review queue).
--
-- ~330 FK columns project-wide lack a covering index; the long tail is on
-- small or dormant tables where an index's write cost is not justified at
-- current volume — those are deliberately left (see AUDIT_REPORT.md). This
-- migration indexes only the columns on tables with real row counts (5k–224k)
-- that the application actually queries by.

-- RAG embedding layers — joined/cascaded by document_id.
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id
  ON public.document_embeddings (document_id);
CREATE INDEX IF NOT EXISTS idx_canonical_document_embeddings_document_id
  ON public.canonical_document_embeddings (document_id);

-- OCR pipeline — the review queue filters ocr_page_jobs by org + review flag.
CREATE INDEX IF NOT EXISTS idx_ocr_page_jobs_organization_id
  ON public.ocr_page_jobs (organization_id);
CREATE INDEX IF NOT EXISTS idx_ocr_page_jobs_aircraft_id
  ON public.ocr_page_jobs (aircraft_id);
CREATE INDEX IF NOT EXISTS idx_ocr_entry_segments_aircraft_id
  ON public.ocr_entry_segments (aircraft_id);
CREATE INDEX IF NOT EXISTS idx_ocr_extracted_events_organization_id
  ON public.ocr_extracted_events (organization_id);
CREATE INDEX IF NOT EXISTS idx_ocr_extracted_events_ocr_page_job_id
  ON public.ocr_extracted_events (ocr_page_job_id);
CREATE INDEX IF NOT EXISTS idx_extracted_field_candidates_extraction_run_id
  ON public.extracted_field_candidates (extraction_run_id);

-- Admin review queue — page.tsx joins each item to its page job / segment /
-- extracted event.
CREATE INDEX IF NOT EXISTS idx_review_queue_items_ocr_page_job_id
  ON public.review_queue_items (ocr_page_job_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_items_ocr_entry_segment_id
  ON public.review_queue_items (ocr_entry_segment_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_items_ocr_extracted_event_id
  ON public.review_queue_items (ocr_extracted_event_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_items_aircraft_id
  ON public.review_queue_items (aircraft_id);

-- Vision retrieval joins embeddings back to their page.
CREATE INDEX IF NOT EXISTS idx_vision_embeddings_vision_page_id
  ON public.vision_embeddings (vision_page_id);

-- Citation anchoring / page lookups by aircraft.
CREATE INDEX IF NOT EXISTS idx_document_pages_aircraft_id
  ON public.document_pages (aircraft_id);
