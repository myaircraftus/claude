-- Migration 005: Document Pages & Chunks

CREATE TABLE document_pages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID REFERENCES aircraft(id),
  page_number     INT NOT NULL,
  page_text       TEXT,
  page_text_tsv   TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(page_text, ''))) STORED,
  ocr_confidence  NUMERIC(5,4),
  image_path      TEXT,
  word_count      INT,
  char_count      INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, page_number)
);

CREATE INDEX idx_pages_document ON document_pages(document_id);
CREATE INDEX idx_pages_org ON document_pages(organization_id);
CREATE INDEX idx_pages_tsv ON document_pages USING GIN(page_text_tsv);

CREATE TABLE document_chunks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID REFERENCES aircraft(id),
  page_number     INT NOT NULL,
  page_number_end INT,
  chunk_index     INT NOT NULL,
  section_title   TEXT,
  parent_section  TEXT,
  chunk_text      TEXT NOT NULL,
  chunk_text_tsv  TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(chunk_text, ''))) STORED,
  token_count     INT,
  char_count      INT,
  parser_confidence NUMERIC(5,4),
  metadata_json   JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_chunks_org ON document_chunks(organization_id);
CREATE INDEX idx_chunks_aircraft ON document_chunks(aircraft_id);
CREATE INDEX idx_chunks_tsv ON document_chunks USING GIN(chunk_text_tsv);
CREATE INDEX idx_chunks_metadata ON document_chunks USING GIN(metadata_json);
