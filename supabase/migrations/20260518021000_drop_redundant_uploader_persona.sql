-- SOP-DOC-001: Document & Persona Architecture — correction to 20260518020000.
--
-- 20260518020000 added `uploader_persona`, but the documents table already
-- had `uploaded_by_persona` (mig 103 / Phase 13.1) — which the upload route
-- (/api/upload/complete) maintains on every upload. Two columns for one fact
-- is exactly the dual-source-of-truth bug SOP-DOC-001 §8.4 warns against.
--
-- Drop the redundant column. `uploaded_by_persona` is the single source of
-- truth for which persona uploaded a document. The `owner_visible` and
-- `published_to_owner_at` ADD COLUMN statements in 20260518020000 were no-ops
-- (those columns already existed) — they are left in place and remain the
-- columns Items 5 & 6 build on.

ALTER TABLE documents DROP COLUMN IF EXISTS uploader_persona;
