-- Migration 019: Document ownership, sharing, and marketplace fields
-- GAPS_1/2/3: Adds per-document ownership, community listing, and manual-access controls.

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE uploader_role AS ENUM ('owner', 'mechanic', 'admin');
CREATE TYPE manual_access AS ENUM ('private', 'free', 'paid');
CREATE TYPE book_assignment AS ENUM ('historical', 'present');
CREATE TYPE listing_status AS ENUM ('draft', 'pending_review', 'published', 'rejected');

-- ─── Document ownership / sharing / listing fields ────────────────────────────

ALTER TABLE documents
  ADD COLUMN uploader_role     uploader_role,
  ADD COLUMN uploader_name     TEXT,
  ADD COLUMN allow_download    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN community_listing BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN manual_access     manual_access,
  ADD COLUMN book_assignment   book_assignment,
  ADD COLUMN price_cents       INTEGER,
  ADD COLUMN attestation_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN listing_status    listing_status,
  ADD COLUMN visibility        TEXT NOT NULL DEFAULT 'team' CHECK (visibility IN ('private', 'team')),
  ADD COLUMN download_count    INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_documents_community ON documents(community_listing) WHERE community_listing = TRUE;
CREATE INDEX idx_documents_listing_status ON documents(listing_status) WHERE listing_status IS NOT NULL;
CREATE INDEX idx_documents_uploader ON documents(uploaded_by) WHERE uploaded_by IS NOT NULL;
