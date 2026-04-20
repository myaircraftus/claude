CREATE TABLE IF NOT EXISTS estimates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  estimate_number TEXT NOT NULL,
  aircraft_id UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mechanic_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'converted')),
  service_type TEXT,
  assumptions TEXT,
  internal_notes TEXT,
  customer_notes TEXT,
  labor_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  parts_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  outside_services_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  valid_until TIMESTAMPTZ,
  linked_work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, estimate_number)
);

CREATE INDEX IF NOT EXISTS idx_estimates_org ON estimates(organization_id);
CREATE INDEX IF NOT EXISTS idx_estimates_aircraft ON estimates(aircraft_id) WHERE aircraft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_customer ON estimates(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_estimates_created_at ON estimates(organization_id, created_at DESC);

ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimates_select" ON estimates;
CREATE POLICY "estimates_select" ON estimates FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));

DROP POLICY IF EXISTS "estimates_insert" ON estimates;
CREATE POLICY "estimates_insert" ON estimates FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS "estimates_update" ON estimates;
CREATE POLICY "estimates_update" ON estimates FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS "estimates_delete" ON estimates;
CREATE POLICY "estimates_delete" ON estimates FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE TABLE IF NOT EXISTS estimate_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  item_type TEXT NOT NULL DEFAULT 'service'
    CHECK (item_type IN ('labor', 'part', 'outside_service', 'service')),
  hours NUMERIC(10,2),
  part_number TEXT,
  vendor TEXT,
  condition TEXT,
  line_status TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_lines_estimate ON estimate_line_items(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_lines_org ON estimate_line_items(organization_id);

ALTER TABLE estimate_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimate_lines_select" ON estimate_line_items;
CREATE POLICY "estimate_lines_select" ON estimate_line_items FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));

DROP POLICY IF EXISTS "estimate_lines_insert" ON estimate_line_items;
CREATE POLICY "estimate_lines_insert" ON estimate_line_items FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS "estimate_lines_update" ON estimate_line_items;
CREATE POLICY "estimate_lines_update" ON estimate_line_items FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS "estimate_lines_delete" ON estimate_line_items;
CREATE POLICY "estimate_lines_delete" ON estimate_line_items FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

CREATE OR REPLACE FUNCTION generate_estimate_number(org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  current_year TEXT := TO_CHAR(NOW(), 'YYYY');
  next_seq INT;
BEGIN
  SELECT COALESCE(MAX(
    NULLIF(
      regexp_replace(estimate_number, '^EST-[0-9]{4}-', ''),
      ''
    )::INT
  ), 0) + 1
  INTO next_seq
  FROM estimates
  WHERE organization_id = org_id
    AND estimate_number LIKE 'EST-' || current_year || '-%';

  RETURN 'EST-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
END;
$$;
