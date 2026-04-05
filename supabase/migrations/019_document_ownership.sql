-- Migration 019: Document ownership, sharing, and marketplace fields
-- GAPS_1/2/3: Adds per-document ownership, community listing, and manual-access controls.
-- Idempotent: safe to re-run.

-- ─── Enums (idempotent) ──────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE uploader_role AS ENUM ('owner', 'mechanic', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE manual_access AS ENUM ('private', 'free', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE book_assignment AS ENUM ('historical', 'present');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE listing_status AS ENUM ('draft', 'pending_review', 'published', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Document ownership / sharing / listing fields ────────────────────────────

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS uploader_role        uploader_role,
  ADD COLUMN IF NOT EXISTS uploader_name        TEXT,
  ADD COLUMN IF NOT EXISTS allow_download       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS community_listing    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_access        manual_access,
  ADD COLUMN IF NOT EXISTS book_assignment      book_assignment,
  ADD COLUMN IF NOT EXISTS price_cents          INTEGER CHECK (price_cents IS NULL OR (price_cents >= 0 AND price_cents <= 100000000)),
  ADD COLUMN IF NOT EXISTS attestation_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS listing_status       listing_status,
  ADD COLUMN IF NOT EXISTS visibility           TEXT NOT NULL DEFAULT 'team' CHECK (visibility IN ('private', 'team')),
  ADD COLUMN IF NOT EXISTS download_count       INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_documents_community ON documents(community_listing) WHERE community_listing = TRUE;
CREATE INDEX IF NOT EXISTS idx_documents_listing_status ON documents(listing_status) WHERE listing_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_uploader ON documents(uploaded_by) WHERE uploaded_by IS NOT NULL;

-- ─── RLS: Cross-org read for published community listings ────────────────────
-- This lets any authenticated user SELECT documents rows where community_listing
-- is TRUE and listing_status is 'published', regardless of org membership.

DROP POLICY IF EXISTS "documents_community_read" ON documents;
CREATE POLICY "documents_community_read" ON documents FOR SELECT
  USING (community_listing = TRUE AND listing_status = 'published');

-- ─── RLS: Owner-only control over own documents ──────────────────────────────
-- Uploader can always update their own document (lock/unlock/delist).
-- This supplements the existing documents_update policy that allows any
-- mechanic+ in the org; we keep that but add this as a safety alternative.

DROP POLICY IF EXISTS "documents_uploader_update" ON documents;
CREATE POLICY "documents_uploader_update" ON documents FOR UPDATE
  USING (uploaded_by = auth.uid());

-- ─── Moderation log (audit trail for approve/reject) ─────────────────────────

CREATE TABLE IF NOT EXISTS marketplace_moderation_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  moderator_id    UUID NOT NULL REFERENCES user_profiles(id),
  action          TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_log_doc ON marketplace_moderation_log(document_id);
CREATE INDEX IF NOT EXISTS idx_moderation_log_moderator ON marketplace_moderation_log(moderator_id);

ALTER TABLE marketplace_moderation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mod_log_read_admins" ON marketplace_moderation_log;
CREATE POLICY "mod_log_read_admins" ON marketplace_moderation_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_platform_admin = TRUE
    )
  );

-- ─── Download event log (for download_count tracking + audit) ────────────────

CREATE TABLE IF NOT EXISTS marketplace_download_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  downloader_id   UUID NOT NULL REFERENCES user_profiles(id),
  downloader_org  UUID REFERENCES organizations(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_download_events_doc ON marketplace_download_events(document_id);
CREATE INDEX IF NOT EXISTS idx_download_events_user ON marketplace_download_events(downloader_id);

ALTER TABLE marketplace_download_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "download_events_read_own" ON marketplace_download_events;
CREATE POLICY "download_events_read_own" ON marketplace_download_events FOR SELECT
  USING (downloader_id = auth.uid());
