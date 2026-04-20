ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS marketplace_downloadable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS marketplace_injectable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS marketplace_preview_available BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE documents
SET
  marketplace_downloadable = CASE
    WHEN manual_access = 'free' THEN TRUE
    WHEN manual_access = 'paid' THEN FALSE
    ELSE FALSE
  END,
  marketplace_injectable = CASE
    WHEN manual_access IN ('free', 'paid') THEN TRUE
    ELSE FALSE
  END,
  marketplace_preview_available = CASE
    WHEN COALESCE(page_count, 0) > 0 THEN TRUE
    ELSE FALSE
  END
WHERE manual_access IS NOT NULL
   OR community_listing = TRUE;
