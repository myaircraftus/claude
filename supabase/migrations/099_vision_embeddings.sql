-- Sprint 8.4 — Vision Embeddings (Phase 8 Foundation).
--
-- The vector index that holds page-level vision embeddings, parallel
-- to the existing `document_embeddings` table that lives in the
-- sacred OCR/RAG pipeline.
--
-- ─── Architecture decision (Sprint 8.4 brief):
--   ColPali / ColQwen2 produce per-token (per-patch) multi-vector
--   embeddings that need late-interaction MaxSim scoring at query
--   time. pgvector handles SINGLE vectors per row.
--
--   Storage strategy:
--     summary_vector (pgvector vector(128)) — mean-pooled summary,
--       used for ANN approx via HNSW. This is the "did I forget
--       this page exists" first-pass filter.
--     patch_vectors (jsonb) — full per-patch matrix (variable
--       count × dim). Late-interaction scoring at retrieval time
--       (Sprint 8.5) re-ranks summary-vector matches using MaxSim
--       over the patches.
--     patch_count (int) — denormalized so retrieval can plan
--       memory without parsing the JSONB.
--
--   This gives ANN-fast first-pass + late-interaction precision
--   without depending on a multivec / multi-row-per-page extension
--   that may not be available on Supabase. When/if Andy wants to
--   migrate to a real multivec extension (e.g. ParadeDB or
--   pg-vectorscale's multivec), the patch_vectors JSONB → flat
--   table migration is well-defined.
--
-- pgvector extension is a hard dependency. The OCR/RAG pipeline
-- (sacred) already uses pgvector for document_embeddings, so it's
-- already enabled. We add a defensive `create extension if not
-- exists` at the top in case this migration is applied to a fresh
-- database before the OCR pipeline.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS vision_embeddings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- vision_pages is a Phase 8 table we own — FK is allowed and
  -- desirable here. Cascade on delete so dropping a page row also
  -- drops its embeddings.
  vision_page_id    uuid NOT NULL REFERENCES vision_pages(id) ON DELETE CASCADE,
  model_used        text NOT NULL,
  embedding_dim     int NOT NULL,
  -- 128-dim summary vector — sufficient for ANN approx on docs.
  -- If a future model dictates a different dim, the migration
  -- adding it should also adjust the HNSW index dimensionality.
  summary_vector    vector(128) NOT NULL,
  -- Multi-vector patch matrix. JSONB with shape:
  --   { "patches": [[f1, f2, ..., fN], [f1, f2, ..., fN], ...] }
  -- Late-interaction MaxSim at retrieval time iterates patches[].
  patch_vectors     jsonb NOT NULL,
  patch_count       int NOT NULL CHECK (patch_count >= 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- HNSW index on the summary vector for ANN-approx retrieval.
-- m=16, ef_construction=100 are conventional for ~thousands-of-rows
-- corpora; bump m to 32 + ef to 200 for very large indexes (10M+).
-- vector_cosine_ops because cosine similarity is the convention for
-- ColPali / ColQwen2 embeddings.
CREATE INDEX IF NOT EXISTS vision_embeddings_summary_hnsw
  ON vision_embeddings
  USING hnsw (summary_vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 100);

-- Btree for the org-scoped page lookup (e.g. getPatchVectors(pageId)).
CREATE UNIQUE INDEX IF NOT EXISTS vision_embeddings_org_page_unique
  ON vision_embeddings (organization_id, vision_page_id);

CREATE INDEX IF NOT EXISTS vision_embeddings_org_idx
  ON vision_embeddings (organization_id, created_at DESC);

ALTER TABLE vision_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read vision_embeddings" ON vision_embeddings;
CREATE POLICY "Org members read vision_embeddings"
  ON vision_embeddings FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- Vision embeddings are written ONLY by the dispatcher / cron with
-- the service-role key (which bypasses RLS). No interactive write
-- policy is needed — admins manipulate vision_pages, not the
-- embedding rows directly.

COMMENT ON TABLE  vision_embeddings IS 'Per-page vision embeddings — ANN summary + late-interaction patch matrix (Sprint 8.4).';
COMMENT ON COLUMN vision_embeddings.summary_vector IS 'Mean-pooled summary vector — first-pass ANN filter via HNSW.';
COMMENT ON COLUMN vision_embeddings.patch_vectors IS 'Full per-patch multi-vector matrix (jsonb { "patches": [[..], [..]] }) — used for MaxSim late-interaction at retrieval time.';
COMMENT ON COLUMN vision_embeddings.patch_count IS 'Denormalized count of patches in patch_vectors. Lets retrieval plan memory.';
