-- Observability columns for the Ask Logbook AI accuracy upgrades:
-- HyDE (Hypothetical Document Embeddings) and doc-type pre-filtering.
--
-- /api/query writes these to rag_query_log per query so the retrieval stack
-- can be measured: whether a HyDE hypothetical was used (and what it was),
-- which doc-type filter was applied, and whether the filter fell back to an
-- unfiltered search because it returned too few chunks.

ALTER TABLE rag_query_log ADD COLUMN IF NOT EXISTS hyde_used boolean NOT NULL DEFAULT false;
ALTER TABLE rag_query_log ADD COLUMN IF NOT EXISTS hyde_hypothetical text;
ALTER TABLE rag_query_log ADD COLUMN IF NOT EXISTS doc_type_filter_used text;
ALTER TABLE rag_query_log ADD COLUMN IF NOT EXISTS doc_type_fallback_triggered boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN rag_query_log.hyde_used IS 'True when a HyDE hypothetical document was generated and used for the vector embedding.';
COMMENT ON COLUMN rag_query_log.hyde_hypothetical IS 'The generated hypothetical logbook entry (truncated ~500 chars), for monitoring HyDE quality.';
COMMENT ON COLUMN rag_query_log.doc_type_filter_used IS 'Comma-joined doc_type values the retrieval was pre-filtered to, or NULL for an unfiltered search.';
COMMENT ON COLUMN rag_query_log.doc_type_fallback_triggered IS 'True when a doc-type-filtered retrieval returned <3 chunks and was retried unfiltered.';
