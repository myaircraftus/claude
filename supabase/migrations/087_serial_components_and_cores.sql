-- Sprint 3.2 — Cores / Rotables + Serialized Components
--
-- Two related tables:
--   serial_components — one row per physical engine/prop/magneto/etc.
--                       Persists across aircraft moves; current install
--                       lives on installed_on_aircraft + status.
--                       removal_history JSONB[] is the move log.
--   core_obligations  — one row per WO line that involves a core charge.
--                       Tracks "was the old core returned within the
--                       agreed window?". Status flips to 'overdue' via
--                       a future cron when due_date < now() AND status='pending'.
--
-- Service-role bypass for write paths via existing supabase server util;
-- mechanic+/owner/admin can write through API routes.

CREATE TABLE IF NOT EXISTS serial_components (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  part_number            text NOT NULL,
  serial_number          text NOT NULL,
  description            text,
  component_class        text NOT NULL CHECK (component_class IN (
                           'engine','propeller','magneto','alternator','starter','other'
                         )),

  installed_on_aircraft  uuid REFERENCES aircraft(id) ON DELETE SET NULL,
  installed_date         date,
  installed_hours        numeric(8,1),
  hours_since_overhaul   numeric(8,1) NOT NULL DEFAULT 0,
  hours_since_new        numeric(8,1) NOT NULL DEFAULT 0,
  removal_history        jsonb NOT NULL DEFAULT '[]'::jsonb,

  status                 text NOT NULL DEFAULT 'in-stock' CHECK (status IN (
                           'installed','in-stock','in-overhaul','scrapped'
                         )),
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- A serial_number is unique within an org × part_number pair (same
-- physical component shouldn't have two records).
CREATE UNIQUE INDEX IF NOT EXISTS serial_components_org_pn_sn_unique
  ON serial_components (organization_id, part_number, serial_number);

CREATE INDEX IF NOT EXISTS serial_components_org_aircraft_idx
  ON serial_components (organization_id, installed_on_aircraft)
  WHERE installed_on_aircraft IS NOT NULL;

CREATE INDEX IF NOT EXISTS serial_components_org_status_idx
  ON serial_components (organization_id, status);

ALTER TABLE serial_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read serial_components" ON serial_components;
CREATE POLICY "Org members read serial_components"
  ON serial_components FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

DROP POLICY IF EXISTS "Mechanic+ write serial_components" ON serial_components;
CREATE POLICY "Mechanic+ write serial_components"
  ON serial_components FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      AND role IN ('owner','admin','mechanic')
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      AND role IN ('owner','admin','mechanic')
  ));

CREATE OR REPLACE FUNCTION serial_components_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS serial_components_updated_at_trg ON serial_components;
CREATE TRIGGER serial_components_updated_at_trg
  BEFORE UPDATE ON serial_components
  FOR EACH ROW EXECUTE FUNCTION serial_components_set_updated_at();

-- ── core_obligations ──
CREATE TABLE IF NOT EXISTS core_obligations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  work_order_id   uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  part_number     text NOT NULL,
  description     text,
  core_charge     numeric(10,2) NOT NULL DEFAULT 0,
  due_date        date,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending','received','overdue','waived'
                  )),
  received_date   date,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS core_obligations_org_status_idx
  ON core_obligations (organization_id, status);
CREATE INDEX IF NOT EXISTS core_obligations_org_wo_idx
  ON core_obligations (organization_id, work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS core_obligations_due_idx
  ON core_obligations (organization_id, due_date) WHERE status = 'pending';

ALTER TABLE core_obligations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read core_obligations" ON core_obligations;
CREATE POLICY "Org members read core_obligations"
  ON core_obligations FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

DROP POLICY IF EXISTS "Mechanic+ write core_obligations" ON core_obligations;
CREATE POLICY "Mechanic+ write core_obligations"
  ON core_obligations FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      AND role IN ('owner','admin','mechanic')
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      AND role IN ('owner','admin','mechanic')
  ));

DROP TRIGGER IF EXISTS core_obligations_updated_at_trg ON core_obligations;
CREATE TRIGGER core_obligations_updated_at_trg
  BEFORE UPDATE ON core_obligations
  FOR EACH ROW EXECUTE FUNCTION serial_components_set_updated_at();
