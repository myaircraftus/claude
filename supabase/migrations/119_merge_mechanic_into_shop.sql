-- Migration 119: Phase 18 Sprint 18.1 — merge 'mechanic' persona into 'shop'.
--
-- The Phase-18 persona model collapses from 4 personas (owner / mechanic /
-- shop / admin) to 3 (owner / shop / admin). Every mechanic role becomes a
-- shop role; the shop surface already had visibility into work orders /
-- scheduling / parts / etc. so this is a pure flatten, no UI regression.
--
-- This migration does five things:
--   1. Backfills organization_memberships.persona='mechanic' to 'shop'
--   2. Backfills user_profiles.persona='mechanic' to 'shop'
--   3. Backfills documents.uploaded_by_persona='mechanic' to 'shop'
--   4. Widens CHECK constraints to drop 'mechanic' from the allowed set
--   5. Rewrites the documents_insert RLS policy (mig 103) so the shop
--      persona owns what mechanic previously could upload
--
-- Shop already could upload everything mechanic could (its rule was
-- "anything except aircraft_logbook + aircraft_registration"). So the
-- RLS rewrite is structural — it drops the mechanic case rather than
-- expanding shop's set. Shop's effective capability is unchanged.

-- ─── 1. Backfill rows ────────────────────────────────────────────────────────

UPDATE organization_memberships
   SET persona = 'shop',
       updated_at = now()
 WHERE persona = 'mechanic';

UPDATE user_profiles
   SET persona = 'shop',
       updated_at = now()
 WHERE persona = 'mechanic';

UPDATE documents
   SET uploaded_by_persona = 'shop'
 WHERE uploaded_by_persona = 'mechanic';

-- entitlements (mig 058) — per-persona subscription state. Existing
-- persona='mechanic' rows merge into the org's persona='shop' row when
-- one exists; otherwise the mechanic row is simply re-tagged. The unique
-- constraint (organization_id, persona) means we need the merge step
-- before re-tagging to avoid a collision.
DELETE FROM entitlements e_mech
 WHERE persona = 'mechanic'
   AND EXISTS (
     SELECT 1 FROM entitlements e_shop
      WHERE e_shop.organization_id = e_mech.organization_id
        AND e_shop.persona = 'shop'
   );

UPDATE entitlements
   SET persona = 'shop',
       updated_at = now()
 WHERE persona = 'mechanic';

-- ─── 2. Widen CHECK constraints ──────────────────────────────────────────────

-- user_profiles.persona (originally added in mig 047, widened in mig 060)
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_persona_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_persona_check
  CHECK (persona IS NULL OR persona IN ('owner', 'shop', 'admin'));

-- organization_memberships.persona (mig 060)
ALTER TABLE organization_memberships
  DROP CONSTRAINT IF EXISTS organization_memberships_persona_check;
ALTER TABLE organization_memberships
  ADD CONSTRAINT organization_memberships_persona_check
  CHECK (persona IS NULL OR persona IN ('owner', 'shop', 'admin'));

-- documents.uploaded_by_persona (mig 103)
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_uploaded_by_persona_check;
ALTER TABLE documents
  ADD CONSTRAINT documents_uploaded_by_persona_check
  CHECK (uploaded_by_persona IN ('owner', 'shop', 'admin'));

-- entitlements.persona (mig 058)
ALTER TABLE entitlements
  DROP CONSTRAINT IF EXISTS entitlements_persona_check;
ALTER TABLE entitlements
  ADD CONSTRAINT entitlements_persona_check
  CHECK (persona IN ('owner', 'shop'));

-- portal_messages.sender_role (mig 056) — customer-portal chat thread roles.
-- 'mechanic' historically meant "the shop side of the conversation". Backfill
-- and widen the CHECK constraint.
UPDATE portal_messages
   SET sender_role = 'shop'
 WHERE sender_role = 'mechanic';

ALTER TABLE portal_messages
  DROP CONSTRAINT IF EXISTS portal_messages_sender_role_check;
ALTER TABLE portal_messages
  ADD CONSTRAINT portal_messages_sender_role_check
  CHECK (sender_role IN ('owner', 'shop'));

-- ─── 3. Rewrite documents_insert RLS to drop the mechanic case ───────────────
--
-- Phase 13.1 mig 103 had a CASE statement that branched on the resolved
-- persona. We drop the mechanic branch entirely. Shop's case is unchanged
-- (it already covered the union of what mechanic could upload).
--
-- The org-role guard `has_org_role(... 'mechanic')` stays in place for the
-- moment — the role enum is broader than the persona enum and 'mechanic'
-- as an org-role is orthogonal to the UI persona. Org-roles aren't being
-- collapsed in this phase.

DROP POLICY IF EXISTS "documents_insert" ON documents;

CREATE POLICY "documents_insert" ON documents FOR INSERT
  WITH CHECK (
    -- 1. Org-role guard (preserved from mig 011 / 103). org-role 'mechanic'
    --    still exists at the role level — only the *persona* enum collapses.
    has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic'])
    -- 2. Persona × document_type guard (post-merge: 3 personas only)
    AND (
      CASE user_persona_in_org(organization_id)
        WHEN 'admin' THEN TRUE
        WHEN 'shop' THEN document_type NOT IN ('aircraft_logbook', 'aircraft_registration')
        WHEN 'owner' THEN document_type IN (
          'aircraft_logbook', 'aircraft_registration', 'aircraft_airworthiness',
          'aircraft_insurance', 'aircraft_poh', 'aircraft_afm',
          'aircraft_weight_balance', 'aircraft_prebuy', 'aircraft_annual',
          'aircraft_100hr',
          'photo', 'receipt', 'other'
        )
        ELSE FALSE
      END
    )
  );

COMMENT ON POLICY "documents_insert" ON documents IS
  'Phase 18 mig 119 — mechanic persona merged into shop. Shop can upload anything except aircraft_logbook + aircraft_registration. Owner uploads aircraft_* + photo/receipt/other. Admin uploads anything. Service-role bypasses.';

-- ─── 4. Audit trail ──────────────────────────────────────────────────────────

INSERT INTO tier_history (
  organization_id,
  from_tier,
  to_tier,
  changed_by_user_id,
  reason,
  changed_at
)
VALUES (
  NULL,
  'beta',
  'beta',
  NULL,
  'Persona model collapsed: mechanic merged into shop via migration 119',
  now()
);
