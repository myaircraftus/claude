-- Migration 036: Book metadata + canonical search layer + scanner linkage

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Books (logbook grouping / batch assignment)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  book_type TEXT,
  book_number TEXT,
  book_assignment TEXT,
  title TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, aircraft_id, book_type, book_number, book_assignment)
);

CREATE INDEX IF NOT EXISTS idx_books_org ON books(organization_id);
CREATE INDEX IF NOT EXISTS idx_books_aircraft ON books(aircraft_id) WHERE aircraft_id IS NOT NULL;

ALTER TABLE books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "books_select" ON books;
DROP POLICY IF EXISTS "books_insert" ON books;
DROP POLICY IF EXISTS "books_update" ON books;
DROP POLICY IF EXISTS "books_delete" ON books;
CREATE POLICY "books_select" ON books FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "books_insert" ON books FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner','admin','mechanic']));
CREATE POLICY "books_update" ON books FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner','admin','mechanic']));
CREATE POLICY "books_delete" ON books FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner','admin']));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Document + scanner linkage to books / scan batches
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS book_id UUID REFERENCES books(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS book_number TEXT,
  ADD COLUMN IF NOT EXISTS book_type TEXT,
  ADD COLUMN IF NOT EXISTS book_assignment TEXT,
  ADD COLUMN IF NOT EXISTS scan_batch_id UUID REFERENCES scan_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_book_id ON documents(book_id);
CREATE INDEX IF NOT EXISTS idx_documents_scan_batch ON documents(scan_batch_id);

ALTER TABLE scan_batches
  ADD COLUMN IF NOT EXISTS book_id UUID REFERENCES books(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS book_number TEXT,
  ADD COLUMN IF NOT EXISTS book_type TEXT,
  ADD COLUMN IF NOT EXISTS book_assignment TEXT;

CREATE INDEX IF NOT EXISTS idx_scan_batches_book_id ON scan_batches(book_id);

ALTER TABLE scan_pages
  ADD COLUMN IF NOT EXISTS abbyy_classification TEXT,
  ADD COLUMN IF NOT EXISTS abbyy_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS abbyy_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ocr_page_jobs
  ADD COLUMN IF NOT EXISTS scan_batch_id UUID REFERENCES scan_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS abbyy_classification TEXT,
  ADD COLUMN IF NOT EXISTS abbyy_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS abbyy_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ocr_page_scan_batch ON ocr_page_jobs(scan_batch_id);

ALTER TABLE ocr_entry_segments
  ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Canonical document chunks + embeddings (truth-index only)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canonical_document_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID REFERENCES aircraft(id),
  page_number INT NOT NULL,
  page_number_end INT,
  chunk_index INT NOT NULL,
  section_title TEXT,
  chunk_text TEXT NOT NULL,
  chunk_text_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(chunk_text, ''))) STORED,
  token_count INT,
  char_count INT,
  parser_confidence NUMERIC(5,4),
  source_chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
  source_segment_id UUID REFERENCES ocr_entry_segments(id) ON DELETE SET NULL,
  truth_state TEXT NOT NULL DEFAULT 'canonical'
    CHECK (truth_state IN ('canonical', 'informational_only', 'non_canonical_evidence')),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_canonical_chunks_document ON canonical_document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_canonical_chunks_org ON canonical_document_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_canonical_chunks_aircraft ON canonical_document_chunks(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_canonical_chunks_tsv ON canonical_document_chunks USING GIN(chunk_text_tsv);
CREATE INDEX IF NOT EXISTS idx_canonical_chunks_metadata ON canonical_document_chunks USING GIN(metadata_json);

CREATE TABLE IF NOT EXISTS canonical_document_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chunk_id UUID NOT NULL REFERENCES canonical_document_chunks(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID REFERENCES aircraft(id),
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-large',
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chunk_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_embeddings_vector ON canonical_document_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_canonical_embeddings_org ON canonical_document_embeddings(organization_id);
CREATE INDEX IF NOT EXISTS idx_canonical_embeddings_aircraft ON canonical_document_embeddings(aircraft_id);

ALTER TABLE canonical_document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_document_embeddings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "canonical_chunks_select" ON canonical_document_chunks;
DROP POLICY IF EXISTS "canonical_chunks_insert" ON canonical_document_chunks;
DROP POLICY IF EXISTS "canonical_embeddings_select" ON canonical_document_embeddings;
DROP POLICY IF EXISTS "canonical_embeddings_insert" ON canonical_document_embeddings;
CREATE POLICY "canonical_chunks_select" ON canonical_document_chunks FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "canonical_chunks_insert" ON canonical_document_chunks FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "canonical_embeddings_select" ON canonical_document_embeddings FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "canonical_embeddings_insert" ON canonical_document_embeddings FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Canonical search RPC (hybrid retrieval)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_canonical_documents(
  p_organization_id UUID,
  p_aircraft_id     UUID,
  p_query_embedding VECTOR(1536),
  p_query_text      TEXT,
  p_doc_type_filter doc_type[],
  p_limit           INT DEFAULT 10,
  p_vector_weight   FLOAT DEFAULT 0.7,
  p_keyword_weight  FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  chunk_id        UUID,
  document_id     UUID,
  document_title  TEXT,
  doc_type        doc_type,
  aircraft_id     UUID,
  page_number     INT,
  page_number_end INT,
  section_title   TEXT,
  chunk_text      TEXT,
  metadata_json   JSONB,
  vector_score    FLOAT,
  keyword_score   FLOAT,
  combined_score  FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT
      cc.id AS chunk_id,
      cc.document_id,
      d.title AS document_title,
      d.doc_type,
      cc.aircraft_id,
      cc.page_number,
      cc.page_number_end,
      cc.section_title,
      cc.chunk_text,
      cc.metadata_json,
      (1 - (ce.embedding <=> p_query_embedding))::FLOAT AS vector_score
    FROM canonical_document_embeddings ce
    JOIN canonical_document_chunks cc ON cc.id = ce.chunk_id
    JOIN documents d ON d.id = cc.document_id
    WHERE ce.organization_id = p_organization_id
      AND (p_aircraft_id IS NULL OR ce.aircraft_id = p_aircraft_id)
      AND (p_doc_type_filter IS NULL OR d.doc_type = ANY(p_doc_type_filter))
      AND d.parsing_status <> 'failed'
    ORDER BY ce.embedding <=> p_query_embedding
    LIMIT (p_limit * 3)
  ),
  keyword_results AS (
    SELECT
      cc.id AS chunk_id,
      ts_rank_cd(cc.chunk_text_tsv, plainto_tsquery('english', p_query_text))::FLOAT AS keyword_score
    FROM canonical_document_chunks cc
    WHERE cc.organization_id = p_organization_id
      AND (p_aircraft_id IS NULL OR cc.aircraft_id = p_aircraft_id)
      AND cc.chunk_text_tsv @@ plainto_tsquery('english', p_query_text)
  )
  SELECT
    vr.chunk_id,
    vr.document_id,
    vr.document_title,
    vr.doc_type,
    vr.aircraft_id,
    vr.page_number,
    vr.page_number_end,
    vr.section_title,
    vr.chunk_text,
    vr.metadata_json,
    vr.vector_score,
    COALESCE(kr.keyword_score, 0.0) AS keyword_score,
    (vr.vector_score * p_vector_weight + COALESCE(kr.keyword_score, 0.0) * p_keyword_weight) AS combined_score
  FROM vector_results vr
  LEFT JOIN keyword_results kr ON kr.chunk_id = vr.chunk_id
  ORDER BY combined_score DESC
  LIMIT p_limit;
END;
$$;
