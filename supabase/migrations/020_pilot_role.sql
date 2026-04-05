-- Migration 020: Add 'pilot' to OrgRole + extend uploader_role enum
-- Idempotent.

-- ─── organization_memberships.role CHECK constraint ──────────────────────────

ALTER TABLE organization_memberships DROP CONSTRAINT IF EXISTS organization_memberships_role_check;

ALTER TABLE organization_memberships
  ADD CONSTRAINT organization_memberships_role_check
  CHECK (role IN ('owner', 'admin', 'mechanic', 'pilot', 'viewer', 'auditor'));

-- ─── uploader_role enum (add 'pilot') ────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE uploader_role ADD VALUE IF NOT EXISTS 'pilot';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
