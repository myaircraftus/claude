-- Owner persona — database-level read-only enforcement.
--
-- Defense-in-depth behind the UI guards: a user acting in the "owner"
-- persona cannot INSERT/UPDATE/DELETE work orders, estimates, invoices,
-- or logbook entries — and cannot UPDATE/DELETE squawks (they CAN still
-- file new squawks). SELECT is never restricted — owners read everything.
--
-- DESIGN NOTES (vs. the original spec):
--  * The spec's policies referenced a `profiles` table with `org_id` and
--    `role` columns. This app has neither — org/role/persona live in
--    `organization_memberships`, the profile table is `user_profiles`,
--    and the discriminator is the UI *persona*, not the org *role*
--    (a shop's org-role 'owner' must still write — it's persona 'shop').
--  * Implemented as ADDITIVE `AS RESTRICTIVE` policies rather than by
--    dropping the existing permissive policies. Restrictive policies are
--    AND-ed with permissive ones, so they can only ever tighten access —
--    they cannot open a hole, and they leave the working shop/mechanic
--    paths (and SELECT) completely intact. No existing policy is dropped.
--  * Scope check: blocks users whose organization_memberships.persona is
--    explicitly 'owner' for the row's organization.
--
-- CAVEAT: RLS only governs the user-scoped Postgres role. Server code
-- paths that use the Supabase SERVICE client bypass RLS entirely — those
-- must keep relying on the UI/route guards. This migration is the DB-level
-- backstop for direct user-token API calls.

-- Re-runnable.
DROP POLICY IF EXISTS work_orders_owner_no_insert     ON work_orders;
DROP POLICY IF EXISTS work_orders_owner_no_update     ON work_orders;
DROP POLICY IF EXISTS work_orders_owner_no_delete     ON work_orders;
DROP POLICY IF EXISTS estimates_owner_no_insert       ON estimates;
DROP POLICY IF EXISTS estimates_owner_no_update       ON estimates;
DROP POLICY IF EXISTS estimates_owner_no_delete       ON estimates;
DROP POLICY IF EXISTS invoices_owner_no_insert        ON invoices;
DROP POLICY IF EXISTS invoices_owner_no_update        ON invoices;
DROP POLICY IF EXISTS invoices_owner_no_delete        ON invoices;
DROP POLICY IF EXISTS logbook_entries_owner_no_insert ON logbook_entries;
DROP POLICY IF EXISTS logbook_entries_owner_no_update ON logbook_entries;
DROP POLICY IF EXISTS logbook_entries_owner_no_delete ON logbook_entries;
DROP POLICY IF EXISTS squawks_owner_no_update         ON squawks;
DROP POLICY IF EXISTS squawks_owner_no_delete         ON squawks;

-- ── WORK ORDERS — owner persona is read-only ──────────────────────────
CREATE POLICY work_orders_owner_no_insert ON work_orders
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = work_orders.organization_id
      AND m.persona = 'owner'
  ));

CREATE POLICY work_orders_owner_no_update ON work_orders
  AS RESTRICTIVE FOR UPDATE
  USING (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = work_orders.organization_id
      AND m.persona = 'owner'
  ));

CREATE POLICY work_orders_owner_no_delete ON work_orders
  AS RESTRICTIVE FOR DELETE
  USING (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = work_orders.organization_id
      AND m.persona = 'owner'
  ));

-- ── ESTIMATES — owner persona is read-only ────────────────────────────
CREATE POLICY estimates_owner_no_insert ON estimates
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = estimates.organization_id
      AND m.persona = 'owner'
  ));

CREATE POLICY estimates_owner_no_update ON estimates
  AS RESTRICTIVE FOR UPDATE
  USING (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = estimates.organization_id
      AND m.persona = 'owner'
  ));

CREATE POLICY estimates_owner_no_delete ON estimates
  AS RESTRICTIVE FOR DELETE
  USING (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = estimates.organization_id
      AND m.persona = 'owner'
  ));

-- ── INVOICES — owner persona is read-only ─────────────────────────────
CREATE POLICY invoices_owner_no_insert ON invoices
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = invoices.organization_id
      AND m.persona = 'owner'
  ));

CREATE POLICY invoices_owner_no_update ON invoices
  AS RESTRICTIVE FOR UPDATE
  USING (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = invoices.organization_id
      AND m.persona = 'owner'
  ));

CREATE POLICY invoices_owner_no_delete ON invoices
  AS RESTRICTIVE FOR DELETE
  USING (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = invoices.organization_id
      AND m.persona = 'owner'
  ));

-- ── LOGBOOK ENTRIES — owner persona is read-only ──────────────────────
CREATE POLICY logbook_entries_owner_no_insert ON logbook_entries
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = logbook_entries.organization_id
      AND m.persona = 'owner'
  ));

CREATE POLICY logbook_entries_owner_no_update ON logbook_entries
  AS RESTRICTIVE FOR UPDATE
  USING (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = logbook_entries.organization_id
      AND m.persona = 'owner'
  ));

CREATE POLICY logbook_entries_owner_no_delete ON logbook_entries
  AS RESTRICTIVE FOR DELETE
  USING (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = logbook_entries.organization_id
      AND m.persona = 'owner'
  ));

-- ── SQUAWKS — owner persona CAN insert, cannot update/delete ──────────
CREATE POLICY squawks_owner_no_update ON squawks
  AS RESTRICTIVE FOR UPDATE
  USING (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = squawks.organization_id
      AND m.persona = 'owner'
  ));

CREATE POLICY squawks_owner_no_delete ON squawks
  AS RESTRICTIVE FOR DELETE
  USING (NOT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = squawks.organization_id
      AND m.persona = 'owner'
  ));
