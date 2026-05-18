-- Phase 1 of the logbook_entries fix — historical (OCR-transcribed) records.
--
-- Decision (owner): a logbook entry transcribed by OCR from the owner's
-- already-completed paper logbooks is the OWNER'S historical record. It is
-- read-only, visible to the owner immediately, and is NOT part of the mechanic
-- draft -> sign workflow. Mechanic-authored NEW entries are unchanged — they
-- stay in `draft` until a mechanic signs them, which is when they become
-- owner-visible. The mechanic never gates the owner's historical records.
--
-- This adds a `historical` status, makes historical entries owner-visible in
-- the RLS gate, and backfills the 391 already-transcribed entries that were
-- wrongly left as hidden `draft` rows.

-- 1. Allow the `historical` status on logbook_entries.
ALTER TABLE logbook_entries DROP CONSTRAINT logbook_entries_status_check;
ALTER TABLE logbook_entries ADD CONSTRAINT logbook_entries_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text, 'ready_for_review'::text, 'ready_to_sign'::text,
    'final'::text, 'signed'::text, 'published_to_owner'::text,
    'printed_unsigned'::text, 'superseded'::text, 'voided'::text,
    'voided_with_reason'::text, 'amended'::text, 'historical'::text
  ]));

-- 2. RLS — the owner persona always sees `historical` records (their own
--    documents), on top of the existing owner_visible / self-created rules.
--    Shop / mechanic / admin personas are unchanged (full visibility).
DROP POLICY IF EXISTS logbook_select ON logbook_entries;
CREATE POLICY logbook_select ON logbook_entries
  FOR SELECT
  USING (
    organization_id = ANY (get_my_org_ids())
    AND (
      NOT EXISTS (
        SELECT 1 FROM organization_memberships m
        WHERE m.user_id = auth.uid()
          AND m.organization_id = logbook_entries.organization_id
          AND m.persona = 'owner'
      )
      OR owner_visible IS TRUE
      OR created_by = auth.uid()
      OR status = 'historical'
    )
  );

-- 3. Backfill — the OCR-transcribed entries are historical records. They were
--    created by backfill scripts (no source_type, no draft_id) and were
--    wrongly left as hidden `draft` rows. Mark them historical, make them
--    owner-visible, tag their source. Mechanic-authored entries (source_type
--    set) and draft-converted entries (draft_id set) are untouched.
UPDATE logbook_entries
SET status = 'historical',
    owner_visible = true,
    source_type = 'historical_ocr',
    published_to_owner_at = COALESCE(published_to_owner_at, updated_at, created_at)
WHERE source_type IS NULL
  AND draft_id IS NULL
  AND status = 'draft';
