-- Owner logbook-entry visibility gate.
--
-- Until now the logbook_select RLS policy was fully permissive
-- (organization_id = ANY(get_my_org_ids())) — every org member, including the
-- owner persona, saw every logbook_entries row, including unsigned mechanic
-- drafts. This migration makes the SELECT policy persona-aware so the owner
-- persona only sees entries that have been published to them (owner_visible,
-- set when a mechanic signs the entry) or that the owner created themselves.
-- Shop / mechanic / admin personas are unaffected — they still see everything.
--
-- The owner-persona detection mirrors the existing logbook_entries_owner_no_*
-- write policies (EXISTS against organization_memberships.persona = 'owner').

-- ── Persona-aware SELECT policy ──────────────────────────────────────────────
DROP POLICY IF EXISTS logbook_select ON logbook_entries;

CREATE POLICY logbook_select ON logbook_entries
  FOR SELECT
  USING (
    organization_id = ANY (get_my_org_ids())
    AND (
      -- Shop / mechanic / admin personas: full visibility (unchanged behaviour).
      NOT EXISTS (
        SELECT 1 FROM organization_memberships m
        WHERE m.user_id = auth.uid()
          AND m.organization_id = logbook_entries.organization_id
          AND m.persona = 'owner'
      )
      -- Owner persona: only entries published to the owner, or self-created.
      OR owner_visible IS TRUE
      OR created_by = auth.uid()
    )
  );

-- ── Backfill 1 — existing signed entries are published to the owner ──────────
-- A signed entry is a finished record; surface it to the owner. published_to_
-- owner_at is set from signed_at (falling back to updated_at) when absent.
UPDATE logbook_entries
SET owner_visible = true,
    published_to_owner_at = COALESCE(published_to_owner_at, signed_at, updated_at)
WHERE status = 'signed'
  AND owner_visible IS NOT TRUE;

-- ── Backfill 2 — entries created by an owner-persona member are owner-visible ─
-- "Owner-created" is detected by the creator's organization_memberships.persona
-- (NOT the org RBAC role — a role='owner' user routinely acts under the shop
-- persona, and every existing draft in this database was created that way, so
-- a role-based backfill would wrongly publish every mechanic draft). Entries an
-- owner created are also visible to that owner at runtime via the created_by =
-- auth.uid() clause above; this backfill additionally surfaces them to any
-- other owner-persona member in the same org.
UPDATE logbook_entries le
SET owner_visible = true
WHERE le.owner_visible IS NOT TRUE
  AND EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = le.created_by
      AND m.organization_id = le.organization_id
      AND m.persona = 'owner'
  );
