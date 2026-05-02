-- Migration 071: Multi-view system per module (Spec 2.4)
--
-- Saved views — same data, multiple shapes (list / calendar / table / board)
-- with persisted filter / sort / groupBy. Per-org, per-user, per-module.
--
-- Coast's killer feature: WorkOrdersPage shouldn't ship one fixed list view —
-- it ships a ViewSelector dropdown with "Status List", "Priority List",
-- "Calendar", "Board", "Overdue", "Assigned to me", and any saved views
-- the operator created. Same architecture for compliance, inspections,
-- invoices, logbook, parts, POs, vendors.

CREATE TABLE IF NOT EXISTS saved_views (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Owner. NULL = "shared with org" (still scoped by organization_id RLS).
  -- For v0 we mostly persist per-user views; org-shared is a future feature
  -- so the column is in place.
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Open enum — string keys must match the spec's module list. We don't
  -- bake a CHECK so future modules can be added without a migration.
  module          TEXT NOT NULL,

  name            TEXT NOT NULL,
  view_type       TEXT NOT NULL DEFAULT 'list'
    CHECK (view_type IN ('list', 'calendar', 'table', 'board')),

  -- Free-form filter / sort / groupBy state. Frontend defines the shape
  -- per module via lib/views/types.ts ModuleViewConfig.
  filters         JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort            JSONB,            -- { field, direction } | null
  group_by        TEXT,             -- column key for board / grouped views

  -- Optional column / display config: which columns to show, in what order,
  -- which is "primary" on calendar/board, etc. Schema-less — module config
  -- in code defines what keys are valid.
  display_config  JSONB NOT NULL DEFAULT '{}'::jsonb,

  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  is_seeded       BOOLEAN NOT NULL DEFAULT FALSE,   -- system-seeded vs user-created
  sort_order      INTEGER NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One name per (user, module). Keeps "My overdue WOs" unique within
  -- the user's WO module set. Org-shared views (user_id IS NULL) live
  -- in a separate uniqueness slot via a partial index below.
  UNIQUE NULLS NOT DISTINCT (organization_id, user_id, module, name)
);

CREATE INDEX IF NOT EXISTS idx_saved_views_user_module
  ON saved_views(organization_id, user_id, module, sort_order)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saved_views_org_shared
  ON saved_views(organization_id, module, sort_order)
  WHERE user_id IS NULL;

-- Only one default per (user, module). A new isDefault=true should clear
-- the prior default in the same scope; the API does this in-app rather
-- than via partial unique (which would error on conflict instead of
-- transparently switching).

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_views_read   ON saved_views;
DROP POLICY IF EXISTS saved_views_write  ON saved_views;

-- Read: a user sees their OWN views + every org-shared view (user_id IS NULL).
CREATE POLICY saved_views_read ON saved_views
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Write: a user can create / edit / delete their OWN views (user_id =
-- auth.uid()). Org-shared views require owner+admin write — handled at
-- the app layer by setting user_id=NULL only when the caller has the
-- right role (the policy below allows it through for any org member;
-- the API gate is the actual enforcement).
CREATE POLICY saved_views_write ON saved_views
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
    AND (user_id IS NULL OR user_id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- ─── updated_at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_saved_views_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS saved_views_set_updated_at ON saved_views;
CREATE TRIGGER saved_views_set_updated_at
  BEFORE UPDATE ON saved_views
  FOR EACH ROW EXECUTE FUNCTION trg_saved_views_set_updated_at();

COMMENT ON TABLE  saved_views IS 'Per-user (or org-shared) view configs across modules (Spec 2.4).';
COMMENT ON COLUMN saved_views.module       IS 'Open string — must match a key in lib/views/types.ts MODULE_CONFIGS.';
COMMENT ON COLUMN saved_views.user_id      IS 'NULL = org-shared (visible to all org members). Otherwise the owning user.';
COMMENT ON COLUMN saved_views.is_seeded    IS 'True for system-seeded default views (e.g. "Active", "Overdue") that ship with each module.';
COMMENT ON COLUMN saved_views.display_config IS 'Free-form per-module display config (column order, calendar date field, board status field, etc.). Schema enforced in app code.';
