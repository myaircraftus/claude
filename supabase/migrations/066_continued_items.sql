-- Migration 066: Continued Items / Deferred Maintenance (Spec 1.4)
--
-- "Found-but-deferred" work that should follow the AIRCRAFT, not the WO.
-- Discovered during one work order, finally resolved (often) on a different
-- one — sometimes months later when the part arrives or scheduling allows.
--
-- One row per (aircraft × deferred-work-item). Status lifecycle:
--   open → in-progress → completed
--                    \→ wont-fix
--
-- Path B: this is greenfield, no overlap with existing work_order /
-- compliance / inspection systems. Cross-links to those systems via FKs:
--   - discovered_on_work_order: REQUIRED (the spec assumes you find these
--     during work) — ON DELETE SET NULL so deleting an old WO doesn't
--     wipe the deferred item it found.
--   - resolved_on_work_order: nullable, set when the item closes.
--   - related_compliance_item: optional bridge to Sprint 1.2 (e.g. a
--     deferred AD compliance item).

CREATE TABLE IF NOT EXISTS continued_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID NOT NULL REFERENCES aircraft(id)      ON DELETE CASCADE,

  description     TEXT NOT NULL,            -- "Cracked baffle on cylinder 3"

  -- Origin work order. Nullable so an item found outside a WO context (e.g.
  -- a pilot squawk that hasn't been opened yet) can still be tracked.
  -- ON DELETE SET NULL preserves audit even if the source WO is removed.
  discovered_on_work_order UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  discovered_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- The user who originally discovered the item (often a mechanic during
  -- another inspection). Audit only — RLS doesn't depend on this.
  discovered_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in-progress', 'completed', 'wont-fix')),
  priority        TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Resolution metadata. resolved_on_work_order is set by the caller (or
  -- by the WO-close hook once that lands as a follow-up).
  resolved_on_work_order UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  resolved_at            TIMESTAMPTZ,
  resolved_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Optional bridge to a Sprint 1.2 compliance item (e.g. deferred AD
  -- compliance). Nullable.
  related_compliance_item UUID REFERENCES compliance_items(id) ON DELETE SET NULL,

  notes        TEXT,

  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_continued_items_org      ON continued_items(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_continued_items_aircraft ON continued_items(aircraft_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_continued_items_open
  ON continued_items(organization_id, aircraft_id, priority)
  WHERE status IN ('open', 'in-progress');
CREATE INDEX IF NOT EXISTS idx_continued_items_discovered_wo
  ON continued_items(discovered_on_work_order)
  WHERE discovered_on_work_order IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_continued_items_resolved_wo
  ON continued_items(resolved_on_work_order)
  WHERE resolved_on_work_order IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE continued_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS continued_items_org_read  ON continued_items;
DROP POLICY IF EXISTS continued_items_org_write ON continued_items;

CREATE POLICY continued_items_org_read ON continued_items
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- mechanic+ writes (matches the rest of the maintenance ecosystem). Pilots
-- intentionally cannot create continued items — they squawk, mechanics
-- triage; the squawk pipeline (013/026) is the right surface for pilots.
CREATE POLICY continued_items_org_write ON continued_items
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic')
    )
  );

-- ─── updated_at trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_continued_items_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS continued_items_set_updated_at ON continued_items;
CREATE TRIGGER continued_items_set_updated_at
  BEFORE UPDATE ON continued_items
  FOR EACH ROW EXECUTE FUNCTION trg_continued_items_set_updated_at();

-- ─── Comments ──────────────────────────────────────────────────────────────

COMMENT ON TABLE  continued_items IS 'Found-but-deferred work that follows the aircraft, not the WO (Spec 1.4).';
COMMENT ON COLUMN continued_items.discovered_on_work_order IS 'The WO during which the item was found. Nullable so we can also track items discovered outside a WO context.';
COMMENT ON COLUMN continued_items.resolved_on_work_order   IS 'The WO that finally closed this item. Set by the user when marking complete or by a future WO-close hook.';
COMMENT ON COLUMN continued_items.related_compliance_item  IS 'Optional bridge to a Sprint 1.2 compliance_item (e.g. deferred AD compliance).';
