-- Migration 004: Documents

CREATE TYPE doc_type AS ENUM (
  'logbook',
  'poh',
  'afm',
  'afm_supplement',
  'maintenance_manual',
  'service_manual',
  'parts_catalog',
  'service_bulletin',
  'airworthiness_directive',
  'work_order',
  'inspection_report',
  'form_337',
  'form_8130',
  'lease_ownership',
  'insurance',
  'compliance',
  'miscellaneous'
);

CREATE TYPE parsing_status AS ENUM (
  'queued',
  'parsing',
  'chunking',
  'embedding',
  'completed',
  'failed',
  'needs_ocr',
  'ocr_processing'
);

CREATE TYPE source_provider AS ENUM (
  'direct_upload',
  'google_drive'
);

CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  doc_type        doc_type NOT NULL DEFAULT 'miscellaneous',
  description     TEXT,
  file_path       TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type       TEXT NOT NULL DEFAULT 'application/pdf',
  checksum_sha256 TEXT,
  page_count      INT,
  parsing_status  parsing_status NOT NULL DEFAULT 'queued',
  parse_error     TEXT,
  parse_started_at TIMESTAMPTZ,
  parse_completed_at TIMESTAMPTZ,
  is_text_native  BOOLEAN,
  ocr_required    BOOLEAN NOT NULL DEFAULT FALSE,
  source_provider source_provider NOT NULL DEFAULT 'direct_upload',
  gdrive_file_id  TEXT,
  gdrive_file_url TEXT,
  gdrive_parent_folder TEXT,
  document_date   DATE,
  revision        TEXT,
  version_number  INT NOT NULL DEFAULT 1,
  supersedes_id   UUID REFERENCES documents(id),
  uploaded_by     UUID REFERENCES user_profiles(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_org ON documents(organization_id);
CREATE INDEX idx_documents_aircraft ON documents(aircraft_id);
CREATE INDEX idx_documents_status ON documents(parsing_status);
CREATE INDEX idx_documents_type ON documents(doc_type);
CREATE INDEX idx_documents_uploaded ON documents(uploaded_at DESC);
