-- Migration 118: Phase 17 Sprint 17.6 — system organization sentinel
--
-- Some platform-level work (public-form ticket triage, alert evaluators,
-- system jobs) calls the AI/cost-logged code path without a real
-- organization_id. The ai_activity_log FK constraint refuses NULL,
-- which produced the "ai_activity_log_organization_id_fkey" errors
-- documented in the Phase 16 report.
--
-- Fix: a single sentinel organization row with a fixed UUID. Code
-- substitutes this id whenever there's no real org. The id is the
-- nil UUID (00000000-…) so it's instantly recognizable and never
-- collides with a real-world UUIDv4.
--
-- The sentinel:
-- - has tier_billing_disabled=true (kill-switch engaged) so it never
--   appears in any billing flow
-- - is filtered out of admin orgs/customer-signals listings in code
-- - has slug='system' so direct lookups still work for ad-hoc queries

INSERT INTO organizations (
  id,
  name,
  slug,
  tier,
  tier_billing_disabled,
  subscription_status,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'System',
  'system',
  'beta',
  true,
  'active',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON COLUMN organizations.id IS
  'UUID. The all-zero "nil" UUID is a sentinel for system-level activity (Phase 17 Sprint 17.6); see lib/ai/anthropic.ts.';
