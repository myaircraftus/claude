-- Migration 034: Add exact-anchor metadata to citations for Ask source preview

ALTER TABLE citations
  ADD COLUMN IF NOT EXISTS page_number_end INT,
  ADD COLUMN IF NOT EXISTS quoted_text TEXT,
  ADD COLUMN IF NOT EXISTS normalized_quoted_text TEXT,
  ADD COLUMN IF NOT EXISTS match_strategy TEXT,
  ADD COLUMN IF NOT EXISTS text_anchor_start INT,
  ADD COLUMN IF NOT EXISTS text_anchor_end INT,
  ADD COLUMN IF NOT EXISTS bounding_regions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_exact_anchor BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE citations
SET
  quoted_text = COALESCE(quoted_text, quoted_snippet),
  normalized_quoted_text = COALESCE(
    normalized_quoted_text,
    NULLIF(
      regexp_replace(lower(COALESCE(quoted_text, quoted_snippet)), '\s+', ' ', 'g'),
      ''
    )
  ),
  match_strategy = COALESCE(match_strategy, 'legacy_page_citation'),
  bounding_regions = COALESCE(bounding_regions, '[]'::jsonb),
  is_exact_anchor = COALESCE(is_exact_anchor, FALSE)
WHERE
  quoted_text IS NULL
  OR normalized_quoted_text IS NULL
  OR match_strategy IS NULL
  OR bounding_regions IS NULL
  OR is_exact_anchor IS NULL;

CREATE INDEX IF NOT EXISTS idx_citations_query_page ON citations(query_id, page_number, citation_index);
CREATE INDEX IF NOT EXISTS idx_citations_document_page ON citations(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_citations_exact_anchor ON citations(is_exact_anchor);
