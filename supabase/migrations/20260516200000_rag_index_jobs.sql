-- RAG index rebuild jobs — audit log for the post-upload BM25 + PageIndex
-- tree rebuilds triggered after a document finishes the existing pipeline.

CREATE TABLE IF NOT EXISTS rag_index_jobs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id        UUID REFERENCES documents(id) ON DELETE CASCADE,
  aircraft_id   UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  org_id        UUID REFERENCES organizations(id) ON DELETE CASCADE,
  job_type      TEXT NOT NULL DEFAULT 'rebuild'
                CHECK (job_type IN ('bm25', 'tree', 'rebuild')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_index_jobs_doc ON rag_index_jobs(doc_id);
CREATE INDEX IF NOT EXISTS idx_rag_index_jobs_org ON rag_index_jobs(org_id, created_at DESC);

ALTER TABLE rag_index_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rag_index_jobs_read ON rag_index_jobs;
CREATE POLICY rag_index_jobs_read ON rag_index_jobs
  FOR SELECT USING (org_id = ANY(get_my_org_ids()));

-- Writes are performed by the service client (post-upload trigger + rebuild
-- routes), which bypasses RLS. A permissive authenticated write policy is
-- included for consistency with the rest of the schema.
DROP POLICY IF EXISTS rag_index_jobs_write ON rag_index_jobs;
CREATE POLICY rag_index_jobs_write ON rag_index_jobs
  FOR ALL
  USING (org_id = ANY(get_my_org_ids()))
  WITH CHECK (org_id = ANY(get_my_org_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON rag_index_jobs TO authenticated;

COMMENT ON TABLE rag_index_jobs IS 'Audit log for post-upload RAG index rebuilds (BM25 keyword index + PageIndex tree).';
