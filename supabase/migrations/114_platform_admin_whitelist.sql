-- Migration 114: Phase 15.5 — Expand platform admin whitelist
--
-- Production has a trigger (NOT a CHECK constraint, despite earlier
-- reports — the trigger raises ERRCODE='check_violation' which looked
-- like a constraint when seen from PostgREST):
--
--   trigger:  trg_enforce_platform_admin_email (BEFORE INSERT/UPDATE)
--   function: public.enforce_platform_admin_email()  SECURITY DEFINER
--
-- The function currently rejects any UPDATE that sets
-- is_platform_admin=true unless email = 'info@myaircraft.us'.
--
-- Neither the trigger nor the function exists in any local migration —
-- they were applied directly to production at some point. This migration
-- captures both into version control AND expands the whitelist to
-- include andy@horf.us so the founder can do solo ops + admin testing
-- under their primary account.
--
-- Defensive intent preserved:
--   - is_platform_admin still cannot be flipped to true for arbitrary
--     accounts. The whitelist is explicit and lives in the function body.
--   - Adding a future admin requires a new migration (115_*) that
--     CREATE OR REPLACEs this function with a longer whitelist. Audit
--     trail = the migration itself.
--
-- This migration is NOT applied automatically. Andy applies via tsx-pg.

-- ──────────────────────────────────────────────────────────────────────
-- 1. Replace the trigger function with the expanded whitelist
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_platform_admin_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_platform_admin = TRUE
     AND LOWER(NEW.email) NOT IN ('info@myaircraft.us', 'andy@horf.us') THEN
    RAISE EXCEPTION
      'is_platform_admin can only be true for whitelisted accounts (got: %)',
      NEW.email
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_platform_admin_email() IS
  'Phase 15.5 (mig 114): whitelist = info@myaircraft.us + andy@horf.us. Future additions require a new migration that CREATE OR REPLACE this function.';

-- The trigger itself is unchanged — it already calls this function.
-- (trg_enforce_platform_admin_email BEFORE INSERT/UPDATE on user_profiles.)
-- We re-create it idempotently in case this migration runs in an
-- environment that has the function but not the trigger (e.g., a fresh
-- staging clone that only got the function definition above).

DROP TRIGGER IF EXISTS trg_enforce_platform_admin_email ON public.user_profiles;
CREATE TRIGGER trg_enforce_platform_admin_email
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_platform_admin_email();

-- ──────────────────────────────────────────────────────────────────────
-- 2. Promote andy@horf.us
-- ──────────────────────────────────────────────────────────────────────

UPDATE public.user_profiles
   SET is_platform_admin = true,
       updated_at = NOW()
 WHERE email = 'andy@horf.us'
   AND is_platform_admin = false;

-- ──────────────────────────────────────────────────────────────────────
-- 3. Audit trail in tier_history
--
-- tier_history is the closest existing audit surface. The CHECK
-- constraint allows only ('beta'|'standard'|'pro') for to_tier so we use
-- 'beta' → 'beta' (no actual tier change) and document the real action
-- in the `reason` column. Phase 16 may add a dedicated admin_audit_log;
-- until then this keeps the elevation traceable.
--
-- Safe to re-run: ON CONFLICT DO NOTHING wouldn't apply (no unique
-- constraint), so we guard with a NOT EXISTS predicate against the
-- exact reason string.
-- ──────────────────────────────────────────────────────────────────────

INSERT INTO public.tier_history
  (organization_id, from_tier, to_tier, changed_by_user_id, reason, changed_at)
SELECT
  om.organization_id,
  'beta',
  'beta',
  up.id,
  'Platform admin status granted to andy@horf.us via migration 114_platform_admin_whitelist',
  NOW()
FROM public.user_profiles up
JOIN public.organization_memberships om
  ON om.user_id = up.id
 AND om.accepted_at IS NOT NULL
WHERE up.email = 'andy@horf.us'
  AND NOT EXISTS (
    SELECT 1 FROM public.tier_history th
    WHERE th.reason = 'Platform admin status granted to andy@horf.us via migration 114_platform_admin_whitelist'
  )
LIMIT 1;
