-- SOP audit — Wave 1.7. Real ANN for the vision (ColQwen2) index.
--
-- lib/vision/index-query.ts `searchVisionIndex` was a Sprint 8.4 stub: it
-- returned the most RECENT vision_embeddings rows, not the most SIMILAR.
-- This adds the real cosine-similarity ANN over vision_embeddings.summary_vector
-- (the HNSW vector_cosine_ops index already exists). Org-scoped via an
-- explicit WHERE — the caller passes the org id it resolved from the session.

CREATE OR REPLACE FUNCTION match_vision_embeddings(
  p_organization_id uuid,
  p_query_vector vector(128),
  p_match_count int
)
RETURNS TABLE (
  vision_page_id uuid,
  model_used text,
  embedding_dim integer,
  summary_score double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ve.vision_page_id,
    ve.model_used,
    ve.embedding_dim,
    -- pgvector <=> is cosine DISTANCE; 1 - distance = cosine similarity.
    (1 - (ve.summary_vector <=> p_query_vector))::double precision AS summary_score
  FROM vision_embeddings ve
  WHERE ve.organization_id = p_organization_id
  ORDER BY ve.summary_vector <=> p_query_vector
  LIMIT GREATEST(1, LEAST(p_match_count, 200));
$$;

COMMENT ON FUNCTION match_vision_embeddings IS
  'SOP audit Wave 1.7 — cosine-similarity ANN over vision_embeddings.summary_vector (ColQwen2 128-dim), org-scoped. Replaces the Sprint 8.4 recent-rows stub in lib/vision/index-query.ts.';
