-- Migration 030: Persist classification truth fields across documents, scanner batches,
-- and OCR entry segments so taxonomy intelligence becomes first-class data.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS record_family TEXT,
  ADD COLUMN IF NOT EXISTS document_class TEXT,
  ADD COLUMN IF NOT EXISTS truth_role TEXT,
  ADD COLUMN IF NOT EXISTS parser_strategy TEXT,
  ADD COLUMN IF NOT EXISTS review_priority TEXT,
  ADD COLUMN IF NOT EXISTS canonical_eligibility BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_relevance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ad_relevance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS inspection_relevance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completeness_relevance BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS intelligence_tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_documents_record_family
  ON documents(organization_id, record_family);

CREATE INDEX IF NOT EXISTS idx_documents_truth_role
  ON documents(organization_id, truth_role);

ALTER TABLE scan_batches
  ADD COLUMN IF NOT EXISTS record_family TEXT,
  ADD COLUMN IF NOT EXISTS document_class TEXT,
  ADD COLUMN IF NOT EXISTS truth_role TEXT,
  ADD COLUMN IF NOT EXISTS parser_strategy TEXT,
  ADD COLUMN IF NOT EXISTS review_priority TEXT,
  ADD COLUMN IF NOT EXISTS canonical_eligibility BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_relevance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ad_relevance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS inspection_relevance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completeness_relevance BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS intelligence_tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_scan_batches_record_family
  ON scan_batches(organization_id, record_family);

ALTER TABLE ocr_entry_segments
  ADD COLUMN IF NOT EXISTS document_group_id TEXT,
  ADD COLUMN IF NOT EXISTS document_detail_id TEXT,
  ADD COLUMN IF NOT EXISTS document_subtype TEXT,
  ADD COLUMN IF NOT EXISTS record_family TEXT,
  ADD COLUMN IF NOT EXISTS document_class TEXT,
  ADD COLUMN IF NOT EXISTS truth_role TEXT,
  ADD COLUMN IF NOT EXISTS parser_strategy TEXT,
  ADD COLUMN IF NOT EXISTS review_priority TEXT,
  ADD COLUMN IF NOT EXISTS canonical_eligibility BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_relevance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ad_relevance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS inspection_relevance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completeness_relevance BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS intelligence_tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_ocr_segments_record_family
  ON ocr_entry_segments(organization_id, record_family);

CREATE INDEX IF NOT EXISTS idx_ocr_segments_truth_role
  ON ocr_entry_segments(organization_id, truth_role);
