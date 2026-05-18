-- Confidence rescore support for the OCR review queue.
--
-- The OCR pipeline already computes per-field confidence (ocr_extracted_events,
-- ocr_entry_segments, ocr_page_jobs) during ingestion. /api/admin/rescore-
-- confidence re-derives a single 0-1 confidence per pending review_queue_items
-- row from that data and, in apply mode, auto-resolves the high-confidence
-- items so the human queue only holds rows that genuinely need a person.
--
-- These two columns persist the result so:
--   * the review queue can sort worst-confidence-first (idx below), and
--   * auto-resolved rows stay auditable + reversible — they are exactly the
--     rows WHERE auto_resolved = true (a human resolve leaves it false).

ALTER TABLE review_queue_items ADD COLUMN IF NOT EXISTS confidence_score numeric;
ALTER TABLE review_queue_items ADD COLUMN IF NOT EXISTS auto_resolved boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_review_queue_items_status_confidence
  ON review_queue_items (status, confidence_score);

COMMENT ON COLUMN review_queue_items.confidence_score IS
  'OCR-pipeline confidence (0-1) recomputed by /api/admin/rescore-confidence. Drives the worst-first review queue sort. NULL until the first rescore apply run.';
COMMENT ON COLUMN review_queue_items.auto_resolved IS
  'True when status was set to resolved by the confidence rescore rather than a human reviewer. Reversible — undo with: UPDATE review_queue_items SET status=''pending'', auto_resolved=false WHERE auto_resolved=true.';
