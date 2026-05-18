-- Wave 2 — Contextual Retrieval.
--
-- Adds context_text to canonical_document_chunks: a short LLM-generated +
-- deterministic context blurb (aircraft / document / section identifiers +
-- a 1-2 sentence situating summary). The vector embedding in
-- canonical_document_embeddings is re-generated over (context_text ||
-- chunk_text) by scripts/wave2-contextualize.mjs. chunk_text itself is NEVER
-- modified — it stays the verbatim source used for display and citations.
--
-- The chunk_text_tsv generated column is redefined to ALSO index context_text
-- ("Contextual BM25"), so keyword search can match the aircraft / AD / SB /
-- part identifiers the context blurb surfaces.
--
-- Behaviour is unchanged AT MIGRATION TIME: context_text is NULL everywhere
-- and coalesced to '' , so the tsv is byte-identical to before. The retrieval
-- gain phases in only as the backfill populates context_text.

ALTER TABLE canonical_document_chunks
  ADD COLUMN IF NOT EXISTS context_text text;

COMMENT ON COLUMN canonical_document_chunks.context_text IS
  'Wave 2 Contextual Retrieval — LLM + deterministic context blurb. The vector embedding and BM25 tsv cover (context_text || chunk_text); chunk_text alone stays the verbatim cited source.';

-- Redefine the BM25 tsvector to cover context_text too (Contextual BM25).
-- Dropping the generated column drops idx_canonical_chunks_tsv with it; both
-- are recreated immediately with the same names.
ALTER TABLE canonical_document_chunks DROP COLUMN chunk_text_tsv;
ALTER TABLE canonical_document_chunks
  ADD COLUMN chunk_text_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(chunk_text, '') || ' ' || coalesce(context_text, ''))
  ) STORED;
CREATE INDEX idx_canonical_chunks_tsv
  ON canonical_document_chunks USING gin (chunk_text_tsv);
