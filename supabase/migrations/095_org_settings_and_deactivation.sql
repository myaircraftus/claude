-- Sprint 6.2 / 6.4 — Org settings JSONB + member deactivation.
--
-- organizations.settings — single JSONB blob the org-settings UI writes
-- to. Loose-shape; the API layer validates per key. Used for:
--   default_labor_rates: { airframe, engine, avionics, interior, shop }
--   tax_profile: { rate, jurisdiction, exempt, exemption_id }
--   document_categories: string[]
--   reminder_offsets: ReminderOffset[]
--   notification_preferences: { in_app, email, push, sms }
--   ai_behavior: 'aggressive' | 'balanced' | 'conservative'
--
-- organization_memberships.deactivated_at — non-null = user can't sign
-- in to this org. Existing auth gates filter on accepted_at IS NOT NULL;
-- a deactivation flow flips accepted_at=null AND stamps deactivated_at
-- so re-activation is reversible (set deactivated_at=null + accepted_at=now()).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

CREATE INDEX IF NOT EXISTS organization_memberships_deactivated_idx
  ON organization_memberships (organization_id)
  WHERE deactivated_at IS NOT NULL;

COMMENT ON COLUMN organizations.settings IS
  'Org-level UI defaults + AI/notification toggles (Spec 6.2). Validated at the API layer.';
COMMENT ON COLUMN organization_memberships.deactivated_at IS
  'Set by /api/memberships/[id] PATCH {action:deactivate}. Non-null = no sign-in.';
