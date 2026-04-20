CREATE TABLE IF NOT EXISTS work_order_checklist_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_id     UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  aircraft_id       UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  template_key      TEXT NOT NULL,
  template_label    TEXT NOT NULL,
  section           TEXT NOT NULL,
  item_key          TEXT NOT NULL,
  item_label        TEXT NOT NULL,
  item_description  TEXT,
  source            TEXT NOT NULL DEFAULT 'deterministic_template',
  source_reference  TEXT,
  required          BOOLEAN NOT NULL DEFAULT TRUE,
  completed         BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at      TIMESTAMPTZ,
  completed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (work_order_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_wo_checklist_work_order
  ON work_order_checklist_items(work_order_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_wo_checklist_org
  ON work_order_checklist_items(organization_id);

CREATE INDEX IF NOT EXISTS idx_wo_checklist_aircraft
  ON work_order_checklist_items(aircraft_id)
  WHERE aircraft_id IS NOT NULL;

ALTER TABLE work_order_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wo_checklist_select" ON work_order_checklist_items;
CREATE POLICY "wo_checklist_select" ON work_order_checklist_items FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));

DROP POLICY IF EXISTS "wo_checklist_insert" ON work_order_checklist_items;
CREATE POLICY "wo_checklist_insert" ON work_order_checklist_items FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS "wo_checklist_update" ON work_order_checklist_items;
CREATE POLICY "wo_checklist_update" ON work_order_checklist_items FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS "wo_checklist_delete" ON work_order_checklist_items;
CREATE POLICY "wo_checklist_delete" ON work_order_checklist_items FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS service_type TEXT;
