-- Migration 021: Saved Parts Catalog
-- Org-level catalog of parts that have been used/ordered.
-- Auto-populated when parts are added to work orders.
-- Mechanics can quick-add from this catalog without re-entering details.

CREATE TABLE IF NOT EXISTS saved_parts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  part_number     TEXT NOT NULL,
  description     TEXT NOT NULL,
  vendor          TEXT,
  unit_price      NUMERIC(12,2),
  condition       TEXT CHECK (condition IN ('new','overhauled','serviceable','used')),
  category        TEXT,
  notes           TEXT,
  use_count       INT NOT NULL DEFAULT 1,
  last_used_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, part_number)
);

CREATE INDEX idx_saved_parts_org         ON saved_parts(organization_id);
CREATE INDEX idx_saved_parts_use_count   ON saved_parts(organization_id, use_count DESC);
CREATE INDEX idx_saved_parts_part_number ON saved_parts(organization_id, part_number);

ALTER TABLE saved_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_parts_select" ON saved_parts FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "saved_parts_insert" ON saved_parts FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "saved_parts_update" ON saved_parts FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "saved_parts_delete" ON saved_parts FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- Function to increment use_count on upsert
CREATE OR REPLACE FUNCTION increment_saved_part_use_count(p_org_id UUID, p_part_number TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE saved_parts
  SET use_count = use_count + 1,
      last_used_at = NOW()
  WHERE organization_id = p_org_id
    AND part_number = p_part_number;
END;
$$;
