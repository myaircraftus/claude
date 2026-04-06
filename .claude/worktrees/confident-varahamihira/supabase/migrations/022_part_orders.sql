-- Migration 022: Part Orders
-- Simple manual part order tracking, separate from Atlas order records.

CREATE TABLE IF NOT EXISTS part_orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  part_number     TEXT,
  description     TEXT NOT NULL,
  vendor          TEXT,
  quantity        NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(12,2),
  condition       TEXT CHECK (condition IN ('new','overhauled','serviceable','used')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','ordered','received','cancelled')),
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_part_orders_org    ON part_orders(organization_id);
CREATE INDEX idx_part_orders_status ON part_orders(organization_id, status);

ALTER TABLE part_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "part_orders_select" ON part_orders FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "part_orders_insert" ON part_orders FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "part_orders_update" ON part_orders FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "part_orders_delete" ON part_orders FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

CREATE TRIGGER touch_part_orders_updated_at
  BEFORE UPDATE ON part_orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
