-- RAG query feedback loop.
--
-- rag_query_log records the outcome of every RAG query (vector + intelligence
-- routes) so the retrieval stack can be measured and tuned: which strategy ran,
-- how many chunks/tree nodes were used, answer length and latency. NO raw query
-- text is stored — only a SHA-256 hash (query_hash) — so the log carries no PII.
-- Writes happen via the service role (bypasses RLS); a SELECT policy scopes
-- reads to the caller's org memberships (same get_my_org_ids() pattern as the
-- other RAG tables).

CREATE TABLE IF NOT EXISTS rag_query_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL,
  aircraft_id      UUID,
  query_hash       TEXT NOT NULL,
  strategy         TEXT NOT NULL,
  chunk_count      INT NOT NULL DEFAULT 0,
  tree_nodes_used  INT NOT NULL DEFAULT 0,
  answer_length    INT NOT NULL DEFAULT 0,
  duration_ms      INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_query_log_aircraft_strategy_created
  ON rag_query_log(aircraft_id, strategy, created_at);

ALTER TABLE rag_query_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rag_query_log_read ON rag_query_log;
CREATE POLICY rag_query_log_read ON rag_query_log
  FOR SELECT USING (org_id = ANY(get_my_org_ids()));

-- Writes are performed by the service client (the query routes), which bypasses
-- RLS. A matching authenticated write policy is included for consistency with
-- the rest of the schema.
DROP POLICY IF EXISTS rag_query_log_write ON rag_query_log;
CREATE POLICY rag_query_log_write ON rag_query_log
  FOR INSERT
  WITH CHECK (org_id = ANY(get_my_org_ids()));

GRANT SELECT, INSERT ON rag_query_log TO authenticated;

COMMENT ON TABLE rag_query_log IS 'RAG query feedback loop — one row per query outcome (strategy, chunk/tree counts, latency). Stores only a SHA-256 hash of the query, no raw text.';

-- Lets a future review pass attach a quality score to a completed index job.
ALTER TABLE rag_index_jobs ADD COLUMN IF NOT EXISTS feedback_score INT;
