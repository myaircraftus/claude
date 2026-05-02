-- Migration 065: Inspections + Procedures / Checklists (Spec 1.3)
--
-- Five tables:
--   procedures            — inspection templates ("Cessna 172 Annual")
--   procedure_sections    — top-level groupings within a procedure
--   procedure_items       — individual checklist items (FAR ref + input type)
--   inspections           — an instance of running a procedure on an aircraft
--   inspection_results    — per-item result rows (value/photo/comments)
--
-- Path B: existing `work_order_checklist_items` (038) is a per-WO ad-hoc
-- checklist — different shape (string item_key + template_key, not FKs to
-- a procedure library). Kept untouched per "add, don't replace". A future
-- cross-cutting cleanup can fold the two systems.

-- ─── 1. procedures ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS procedures (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  -- Make/model strings this procedure applies to (optional filter — empty
  -- = applies to anything in the org). Stored as TEXT[] for cheap @> queries.
  applies_to      TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_procedures_org           ON procedures(organization_id);
CREATE INDEX IF NOT EXISTS idx_procedures_applies_to    ON procedures USING GIN(applies_to);

-- ─── 2. procedure_sections ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS procedure_sections (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  procedure_id UUID NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,                     -- "Engine", "Airframe"
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procedure_sections_proc ON procedure_sections(procedure_id, sort_order);

-- ─── 3. procedure_items ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS procedure_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  procedure_section_id UUID NOT NULL REFERENCES procedure_sections(id) ON DELETE CASCADE,
  text                TEXT NOT NULL,              -- "Inspect spark plugs"
  input_type          TEXT NOT NULL DEFAULT 'checkbox'
    CHECK (input_type IN ('checkbox', 'pass-fail', 'value', 'photo', 'signature')),
  reference           TEXT,                       -- FAR reference, manual page
  requires_photo      BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procedure_items_section ON procedure_items(procedure_section_id, sort_order);

-- ─── 4. inspections ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inspections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  procedure_id    UUID NOT NULL REFERENCES procedures(id) ON DELETE RESTRICT,
  -- Snapshot of procedure name at creation time so deleting/renaming the
  -- procedure doesn't lose the historical context.
  procedure_name_snapshot TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in-progress', 'complete', 'complete-requires-attention')),
  assignee        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date        DATE,
  start_date      TIMESTAMPTZ,
  completed_date  TIMESTAMPTZ,
  -- Linked work order (nullable — inspections can be standalone).
  linked_work_order UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  -- Compliance items this inspection completes (Sprint 1.2 cross-link).
  -- TEXT[] of UUIDs because compliance_items can be deleted independently.
  linked_compliance_items UUID[] NOT NULL DEFAULT '{}'::UUID[],
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspections_org      ON inspections(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_aircraft ON inspections(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status   ON inspections(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_inspections_wo       ON inspections(linked_work_order)
  WHERE linked_work_order IS NOT NULL;

-- ─── 5. inspection_results ──────────────────────────────────────────────────
-- One row per (inspection × procedure_item). UPSERT on the natural key so
-- repeated saves of the same row don't pile up history — a future audit
-- table can capture mutation history if needed.

CREATE TABLE IF NOT EXISTS inspection_results (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id      UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  procedure_item_id  UUID NOT NULL REFERENCES procedure_items(id) ON DELETE CASCADE,
  -- The recorded value. Stored as JSONB to handle string | boolean | number
  -- without a type column. Frontend reads input_type from the procedure_item
  -- and parses appropriately.
  value              JSONB,
  passed             BOOLEAN,
  -- URLs of uploaded photos. Photo upload is a logged follow-up; this
  -- column is ready when storage wiring lands.
  photo_urls         TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  comments           TEXT,
  completed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (inspection_id, procedure_item_id)
);

CREATE INDEX IF NOT EXISTS idx_inspection_results_insp ON inspection_results(inspection_id);

-- ─── 6. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE procedures           ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedure_sections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedure_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_results   ENABLE ROW LEVEL SECURITY;

-- procedures: org-member read, mechanic+/admin/owner write
DROP POLICY IF EXISTS procedures_org_read  ON procedures;
DROP POLICY IF EXISTS procedures_org_write ON procedures;

CREATE POLICY procedures_org_read ON procedures
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY procedures_org_write ON procedures
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

-- procedure_sections + procedure_items: gated through parent procedure's
-- org via subquery (mirror of meter_definitions in 063).
DROP POLICY IF EXISTS procedure_sections_org_read  ON procedure_sections;
DROP POLICY IF EXISTS procedure_sections_org_write ON procedure_sections;

CREATE POLICY procedure_sections_org_read ON procedure_sections
  FOR SELECT
  USING (
    procedure_id IN (
      SELECT id FROM procedures
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      )
    )
  );

CREATE POLICY procedure_sections_org_write ON procedure_sections
  FOR ALL
  USING (
    procedure_id IN (
      SELECT id FROM procedures
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid()
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin', 'mechanic')
      )
    )
  )
  WITH CHECK (
    procedure_id IN (
      SELECT id FROM procedures
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid()
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin', 'mechanic')
      )
    )
  );

DROP POLICY IF EXISTS procedure_items_org_read  ON procedure_items;
DROP POLICY IF EXISTS procedure_items_org_write ON procedure_items;

CREATE POLICY procedure_items_org_read ON procedure_items
  FOR SELECT
  USING (
    procedure_section_id IN (
      SELECT id FROM procedure_sections
      WHERE procedure_id IN (
        SELECT id FROM procedures
        WHERE organization_id IN (
          SELECT organization_id FROM organization_memberships
          WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
        )
      )
    )
  );

CREATE POLICY procedure_items_org_write ON procedure_items
  FOR ALL
  USING (
    procedure_section_id IN (
      SELECT id FROM procedure_sections
      WHERE procedure_id IN (
        SELECT id FROM procedures
        WHERE organization_id IN (
          SELECT organization_id FROM organization_memberships
          WHERE user_id = auth.uid()
            AND accepted_at IS NOT NULL
            AND role IN ('owner', 'admin', 'mechanic')
        )
      )
    )
  )
  WITH CHECK (
    procedure_section_id IN (
      SELECT id FROM procedure_sections
      WHERE procedure_id IN (
        SELECT id FROM procedures
        WHERE organization_id IN (
          SELECT organization_id FROM organization_memberships
          WHERE user_id = auth.uid()
            AND accepted_at IS NOT NULL
            AND role IN ('owner', 'admin', 'mechanic')
        )
      )
    )
  );

-- inspections: org-member read; mechanic+/pilot write (pilots can run
-- pre-flight inspections — matches meter_readings RLS in 063).
DROP POLICY IF EXISTS inspections_org_read  ON inspections;
DROP POLICY IF EXISTS inspections_org_write ON inspections;

CREATE POLICY inspections_org_read ON inspections
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY inspections_org_write ON inspections
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic', 'pilot')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin', 'mechanic', 'pilot')
    )
  );

-- inspection_results: gated through parent inspection's org. Anyone who
-- can write the inspection can write its results.
DROP POLICY IF EXISTS inspection_results_org_read  ON inspection_results;
DROP POLICY IF EXISTS inspection_results_org_write ON inspection_results;

CREATE POLICY inspection_results_org_read ON inspection_results
  FOR SELECT
  USING (
    inspection_id IN (
      SELECT id FROM inspections
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      )
    )
  );

CREATE POLICY inspection_results_org_write ON inspection_results
  FOR ALL
  USING (
    inspection_id IN (
      SELECT id FROM inspections
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid()
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin', 'mechanic', 'pilot')
      )
    )
  )
  WITH CHECK (
    inspection_id IN (
      SELECT id FROM inspections
      WHERE organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid()
          AND accepted_at IS NOT NULL
          AND role IN ('owner', 'admin', 'mechanic', 'pilot')
      )
    )
  );

-- ─── 7. updated_at triggers ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_inspections_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS procedures_set_updated_at         ON procedures;
DROP TRIGGER IF EXISTS procedure_sections_set_updated_at ON procedure_sections;
DROP TRIGGER IF EXISTS procedure_items_set_updated_at    ON procedure_items;
DROP TRIGGER IF EXISTS inspections_set_updated_at        ON inspections;
DROP TRIGGER IF EXISTS inspection_results_set_updated_at ON inspection_results;

CREATE TRIGGER procedures_set_updated_at         BEFORE UPDATE ON procedures         FOR EACH ROW EXECUTE FUNCTION trg_inspections_set_updated_at();
CREATE TRIGGER procedure_sections_set_updated_at BEFORE UPDATE ON procedure_sections FOR EACH ROW EXECUTE FUNCTION trg_inspections_set_updated_at();
CREATE TRIGGER procedure_items_set_updated_at    BEFORE UPDATE ON procedure_items    FOR EACH ROW EXECUTE FUNCTION trg_inspections_set_updated_at();
CREATE TRIGGER inspections_set_updated_at        BEFORE UPDATE ON inspections        FOR EACH ROW EXECUTE FUNCTION trg_inspections_set_updated_at();
CREATE TRIGGER inspection_results_set_updated_at BEFORE UPDATE ON inspection_results FOR EACH ROW EXECUTE FUNCTION trg_inspections_set_updated_at();

-- ─── 8. Comments ───────────────────────────────────────────────────────────

COMMENT ON TABLE  procedures           IS 'Inspection templates (Spec 1.3). Coexists with work_order_checklist_items (038).';
COMMENT ON TABLE  procedure_sections   IS 'Top-level groupings within a procedure ("Engine", "Airframe").';
COMMENT ON TABLE  procedure_items      IS 'Individual checklist items with input_type + optional FAR/manual reference.';
COMMENT ON TABLE  inspections          IS 'An instance of running a procedure on an aircraft (Spec 1.3).';
COMMENT ON TABLE  inspection_results   IS 'Per-item results: value (JSONB), pass/fail, photos, comments. UPSERT on (inspection_id, procedure_item_id).';
COMMENT ON COLUMN inspections.linked_work_order        IS 'Optional FK to work_orders — Sprint 1.3 / 2.x WorkOrder integration.';
COMMENT ON COLUMN inspections.linked_compliance_items  IS 'compliance_items (1.2) this inspection completes. Array because deletion of a compliance item shouldn''t cascade-kill historical inspections.';
