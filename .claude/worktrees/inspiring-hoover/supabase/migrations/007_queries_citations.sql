-- Migration 007: Queries & Citations

CREATE TYPE query_confidence AS ENUM (
  'high',
  'medium',
  'low',
  'insufficient_evidence'
);

CREATE TABLE queries (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id          UUID REFERENCES aircraft(id),
  user_id              UUID REFERENCES user_profiles(id),
  question             TEXT NOT NULL,
  question_tsv         TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', question)) STORED,
  answer               TEXT,
  confidence           query_confidence NOT NULL DEFAULT 'insufficient_evidence',
  confidence_score     NUMERIC(5,4),
  doc_types_searched   doc_type[],
  chunks_retrieved     INT,
  chunks_used          INT,
  model_used           TEXT,
  tokens_prompt        INT,
  tokens_completion    INT,
  latency_ms           INT,
  warning_flags        TEXT[],
  follow_up_questions  TEXT[],
  is_bookmarked        BOOLEAN NOT NULL DEFAULT FALSE,
  user_feedback        TEXT CHECK (user_feedback IN ('helpful', 'not_helpful', 'partially_helpful')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE citations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_id        UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_id        UUID REFERENCES document_chunks(id),
  page_number     INT NOT NULL,
  section_title   TEXT,
  quoted_snippet  TEXT NOT NULL,
  relevance_score NUMERIC(5,4),
  citation_index  INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_queries_org ON queries(organization_id);
CREATE INDEX idx_queries_aircraft ON queries(aircraft_id);
CREATE INDEX idx_queries_user ON queries(user_id);
CREATE INDEX idx_queries_created ON queries(created_at DESC);
CREATE INDEX idx_queries_tsv ON queries USING GIN(question_tsv);
CREATE INDEX idx_citations_query ON citations(query_id);
CREATE INDEX idx_citations_document ON citations(document_id);
