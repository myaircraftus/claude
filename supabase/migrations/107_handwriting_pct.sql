-- Migration 107: Phase 14 — handwriting detection metadata on documents
--
-- Adds:
--   documents.handwriting_pct       — null until handwriting detector runs;
--                                     0..1 fraction of pages that look hand-
--                                     written (Claude Vision pre-flight or
--                                     ColQwen2 patch heuristic — whichever
--                                     ships first)
--   documents.suggests_review       — derived flag; TRUE when handwriting_pct
--                                     exceeds PROCESSING_RULES.handwritingThreshold
--                                     (0.3 / 30%). Drives the upload UI's
--                                     review banner.

BEGIN;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS handwriting_pct NUMERIC;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS suggests_review BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_handwriting_pct_check;
ALTER TABLE documents
  ADD CONSTRAINT documents_handwriting_pct_check
  CHECK (handwriting_pct IS NULL OR (handwriting_pct >= 0 AND handwriting_pct <= 1));

COMMENT ON COLUMN documents.handwriting_pct IS
  'Phase 14: fraction (0..1) of the document that looks handwritten. NULL means the detector has not run yet. See lib/vision/handwriting-detector.ts.';
COMMENT ON COLUMN documents.suggests_review IS
  'Phase 14: TRUE when handwriting_pct exceeds the threshold defined in pricing-config.ts. Drives the upload UI''s "Expert A&P Verification" banner.';

CREATE INDEX IF NOT EXISTS idx_documents_suggests_review
  ON documents (organization_id)
  WHERE suggests_review = TRUE;

COMMIT;
