-- Migration 006: Embeddings (pgvector)

CREATE TABLE document_embeddings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chunk_id        UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID REFERENCES aircraft(id),
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-large',
  embedding       VECTOR(1536),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chunk_id)
);

CREATE INDEX idx_embeddings_vector ON document_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_embeddings_org ON document_embeddings(organization_id);
CREATE INDEX idx_embeddings_aircraft ON document_embeddings(aircraft_id);

-- Hybrid search function
CREATE OR REPLACE FUNCTION search_aircraft_documents(
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
      dc.id AS chunk_id,
      dc.document_id,
      d.title AS document_title,
      d.doc_type,
      dc.aircraft_id,
      dc.page_number,
      dc.section_title,
      dc.chunk_text,
      dc.metadata_json,
      (1 - (de.embedding <=> p_query_embedding))::FLOAT AS vector_score
    FROM document_embeddings de
    JOIN document_chunks dc ON dc.id = de.chunk_id
    JOIN documents d ON d.id = dc.document_id
    WHERE de.organization_id = p_organization_id
      AND (p_aircraft_id IS NULL OR de.aircraft_id = p_aircraft_id)
      AND (p_doc_type_filter IS NULL OR d.doc_type = ANY(p_doc_type_filter))
      AND d.parsing_status = 'completed'
    ORDER BY de.embedding <=> p_query_embedding
    LIMIT (p_limit * 3)
  ),
  keyword_results AS (
    SELECT
      dc.id AS chunk_id,
      ts_rank_cd(dc.chunk_text_tsv, plainto_tsquery('english', p_query_text))::FLOAT AS keyword_score
    FROM document_chunks dc
    WHERE dc.organization_id = p_organization_id
      AND (p_aircraft_id IS NULL OR dc.aircraft_id = p_aircraft_id)
      AND dc.chunk_text_tsv @@ plainto_tsquery('english', p_query_text)
  )
  SELECT
    vr.chunk_id,
    vr.document_id,
    vr.document_title,
    vr.doc_type,
    vr.aircraft_id,
    vr.page_number,
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
