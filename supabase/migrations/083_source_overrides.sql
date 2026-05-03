-- Sprint 7.8 — Source Priority Framework audit log.
--
-- One row per "the system replaced X with Y because Y came from a
-- higher-priority source." Used to surface "this was an estimate; we
-- replaced it on $date with an uploaded receipt" in the UI, and to give
-- operators a CSV-able audit trail at tax time.
--
-- entity_type intentionally TEXT (not enum) so future entity types
-- (compliance_item, aircraft_field, …) don't need a migration. CHECK
-- constraint enforces the known set today; widen via ALTER when we add.

CREATE TABLE IF NOT EXISTS source_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  entity_type     text NOT NULL CHECK (entity_type IN (
                    'meter_reading',
                    'cost_entry',
                    'aircraft_field',
                    'compliance_item',
                    'flight_event'
                  )),
  entity_id       uuid NOT NULL,
  field_name      text NOT NULL,

  -- JSONB so values of different types (numbers, strings, dates) round-trip.
  old_value       jsonb,
  new_value       jsonb,

  old_source      text,
  old_priority    int  CHECK (old_priority IS NULL OR old_priority BETWEEN 1 AND 5),
  new_source      text NOT NULL,
  new_priority    int  NOT NULL CHECK (new_priority BETWEEN 1 AND 5),

  -- Optional cross-link to the document that triggered the override.
  document_id     uuid REFERENCES intake_documents(id) ON DELETE SET NULL,

  triggered_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Hot path: "show me all overrides for this entity in date order"
-- (UI on the entity detail page).
CREATE INDEX IF NOT EXISTS source_overrides_entity_idx
  ON source_overrides (organization_id, entity_type, entity_id, created_at DESC);

-- Org-level audit feed.
CREATE INDEX IF NOT EXISTS source_overrides_org_recent_idx
  ON source_overrides (organization_id, created_at DESC);

-- Reverse lookup from a source document (e.g. "what did this receipt change?").
CREATE INDEX IF NOT EXISTS source_overrides_document_idx
  ON source_overrides (document_id)
  WHERE document_id IS NOT NULL;

ALTER TABLE source_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read source_overrides" ON source_overrides;
CREATE POLICY "Org members can read source_overrides"
  ON source_overrides
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
    )
  );

-- Inserts go through the service-role client (audit logger). Block
-- direct authenticated INSERT/UPDATE/DELETE by default.
DROP POLICY IF EXISTS "Service role only writes source_overrides" ON source_overrides;
CREATE POLICY "Service role only writes source_overrides"
  ON source_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (false);
