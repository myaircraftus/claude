-- Sprint 5.8 — per-user persona override slot.
--
-- Adds a single JSONB column to organization_memberships so a user can
-- override their persona's defaults (date range, group-by, sort) without
-- a new table. Spec 5.8 calls these per-user overrides "preferences";
-- the canonical persona stays in `persona` (added back in 0.2 / migration
-- 047). Overrides are an additive layer.
--
-- Shape (loose — validated by the API layer in
-- lib/persona/defaults.ts:resolvePersonaPrefs):
--   {
--     defaultDateRange: '7d' | '30d' | '90d' | '365d' | 'ytd'
--     defaultGroupBy: string | null
--     defaultSort: { field: string, direction: 'asc' | 'desc' }
--     notificationTone: 'plain' | 'technical' | 'operations'
--     voiceIntentPriors: string[]
--   }
--
-- Empty object (default) means "use the persona defaults verbatim".

ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS persona_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- No new index needed; persona_overrides is read whenever the membership
-- row is read (on session resolve), and never queried by JSON path.

COMMENT ON COLUMN organization_memberships.persona_overrides IS
  'Per-user persona preference overrides (Spec 5.8). Patches the shared PERSONA_CONFIG defaults.';
