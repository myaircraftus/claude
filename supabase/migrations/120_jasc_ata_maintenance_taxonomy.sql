-- Migration 120: JASC / ATA maintenance taxonomy source of truth
--
-- Adds the shared aircraft maintenance classification layer used by aircraft,
-- due/compliance items, continued items, work orders, estimates, parts,
-- squawks, logbook entries, invoices, and reporting. ATA/JASC codes stay as
-- strings so leading zeros are preserved.

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── Reference taxonomy ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ata_chapters (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ata_code        TEXT NOT NULL UNIQUE CHECK (ata_code ~ '^[0-9]{2}$'),
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'unknown'
                  CHECK (status IN ('active', 'reserved', 'special_use', 'unknown')),
  source          TEXT NOT NULL DEFAULT 'FAA Joint Aircraft System/Component Code Table and Definitions',
  source_version  TEXT NOT NULL DEFAULT '2008-10-27',
  source_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jasc_codes (
  id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jasc_code                       TEXT NOT NULL UNIQUE CHECK (jasc_code ~ '^[0-9]{4}$'),
  ata_code                        TEXT NOT NULL REFERENCES ata_chapters(ata_code)
                                  ON UPDATE CASCADE ON DELETE RESTRICT
                                  CHECK (ata_code ~ '^[0-9]{2}$'),
  title                           TEXT NOT NULL,
  definition                      TEXT,
  source                          TEXT NOT NULL DEFAULT 'FAA Joint Aircraft System/Component Code Table and Definitions',
  source_version                  TEXT NOT NULL DEFAULT '2008-10-27',
  source_url                      TEXT,
  status                          TEXT NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'reserved', 'special_use', 'unknown')),
  applicable_fixed_wing           BOOLEAN NOT NULL DEFAULT TRUE,
  applicable_rotorcraft           BOOLEAN NOT NULL DEFAULT TRUE,
  applicable_piston               BOOLEAN NOT NULL DEFAULT TRUE,
  applicable_turbine              BOOLEAN NOT NULL DEFAULT TRUE,
  applicable_jet                  BOOLEAN NOT NULL DEFAULT TRUE,
  applicable_turboprop            BOOLEAN NOT NULL DEFAULT TRUE,
  applicable_single_engine        BOOLEAN NOT NULL DEFAULT TRUE,
  applicable_multi_engine         BOOLEAN NOT NULL DEFAULT TRUE,
  system_level                    BOOLEAN NOT NULL DEFAULT FALSE,
  wiring_code                     BOOLEAN NOT NULL DEFAULT FALSE,
  notes                           TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS taxonomy_import_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source          TEXT NOT NULL,
  source_version  TEXT NOT NULL,
  source_url      TEXT,
  ata_count       INTEGER NOT NULL DEFAULT 0 CHECK (ata_count >= 0),
  jasc_count      INTEGER NOT NULL DEFAULT 0 CHECK (jasc_count >= 0),
  imported_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jasc_codes_ata_code ON jasc_codes(ata_code);
CREATE INDEX IF NOT EXISTS idx_jasc_codes_title ON jasc_codes(title);
CREATE INDEX IF NOT EXISTS idx_jasc_codes_search ON jasc_codes
  USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(definition, '')));
CREATE INDEX IF NOT EXISTS idx_ata_chapters_search ON ata_chapters
  USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

DROP TRIGGER IF EXISTS trg_ata_chapters_updated_at ON ata_chapters;
CREATE TRIGGER trg_ata_chapters_updated_at
  BEFORE UPDATE ON ata_chapters
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_jasc_codes_updated_at ON jasc_codes;
CREATE TRIGGER trg_jasc_codes_updated_at
  BEFORE UPDATE ON jasc_codes
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE ata_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE jasc_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxonomy_import_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ata_chapters_read ON ata_chapters;
CREATE POLICY ata_chapters_read ON ata_chapters
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS jasc_codes_read ON jasc_codes;
CREATE POLICY jasc_codes_read ON jasc_codes
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS taxonomy_import_runs_admin_read ON taxonomy_import_runs;
CREATE POLICY taxonomy_import_runs_admin_read ON taxonomy_import_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'admin')
    )
  );

-- Supabase Data API exposure changed in 2026: explicit grants make the new
-- reference tables readable once migrations are applied.
GRANT SELECT ON ata_chapters, jasc_codes TO authenticated;
GRANT SELECT ON taxonomy_import_runs TO authenticated;

COMMENT ON TABLE ata_chapters IS 'ATA system/chapter reference table. Codes are two-character strings, e.g. 05, 32.';
COMMENT ON TABLE jasc_codes IS 'FAA JASC system/component reference table. Codes are four-character strings and join to ATA by ata_code.';
COMMENT ON TABLE taxonomy_import_runs IS 'Audit trail for repeatable JASC/ATA import command runs.';

-- ─── Aircraft-specific applicability overrides ────────────────────────────

ALTER TABLE aircraft
  ADD COLUMN IF NOT EXISTS taxonomy_aircraft_kind TEXT
    CHECK (taxonomy_aircraft_kind IS NULL OR taxonomy_aircraft_kind IN ('fixed_wing', 'rotorcraft', 'experimental', 'unknown')),
  ADD COLUMN IF NOT EXISTS taxonomy_engine_type TEXT
    CHECK (taxonomy_engine_type IS NULL OR taxonomy_engine_type IN ('piston', 'turbine', 'jet', 'turboprop', 'electric', 'none', 'unknown')),
  ADD COLUMN IF NOT EXISTS taxonomy_engine_count INTEGER
    CHECK (taxonomy_engine_count IS NULL OR taxonomy_engine_count >= 0),
  ADD COLUMN IF NOT EXISTS taxonomy_landing_gear_type TEXT,
  ADD COLUMN IF NOT EXISTS taxonomy_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS aircraft_taxonomy_applicability (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id          UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  ata_code             TEXT NOT NULL REFERENCES ata_chapters(ata_code)
                       ON UPDATE CASCADE ON DELETE CASCADE
                       CHECK (ata_code ~ '^[0-9]{2}$'),
  jasc_code            TEXT REFERENCES jasc_codes(jasc_code)
                       ON UPDATE CASCADE ON DELETE CASCADE
                       CHECK (jasc_code IS NULL OR jasc_code ~ '^[0-9]{4}$'),
  applicable           BOOLEAN NOT NULL DEFAULT TRUE,
  visible_default      BOOLEAN NOT NULL DEFAULT TRUE,
  reason               TEXT,
  manufacturer_label   TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aircraft_taxonomy_app_unique
  ON aircraft_taxonomy_applicability (aircraft_id, ata_code, coalesce(jasc_code, ''));
CREATE INDEX IF NOT EXISTS idx_aircraft_taxonomy_app_org
  ON aircraft_taxonomy_applicability (organization_id, aircraft_id);
CREATE INDEX IF NOT EXISTS idx_aircraft_taxonomy_app_code
  ON aircraft_taxonomy_applicability (ata_code, jasc_code);

DROP TRIGGER IF EXISTS trg_aircraft_taxonomy_app_updated_at ON aircraft_taxonomy_applicability;
CREATE TRIGGER trg_aircraft_taxonomy_app_updated_at
  BEFORE UPDATE ON aircraft_taxonomy_applicability
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE aircraft_taxonomy_applicability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aircraft_taxonomy_app_read ON aircraft_taxonomy_applicability;
CREATE POLICY aircraft_taxonomy_app_read ON aircraft_taxonomy_applicability
  FOR SELECT USING (organization_id = ANY(get_my_org_ids()));

DROP POLICY IF EXISTS aircraft_taxonomy_app_write ON aircraft_taxonomy_applicability;
CREATE POLICY aircraft_taxonomy_app_write ON aircraft_taxonomy_applicability
  FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

GRANT SELECT, INSERT, UPDATE, DELETE ON aircraft_taxonomy_applicability TO authenticated;

COMMENT ON TABLE aircraft_taxonomy_applicability IS 'Aircraft-specific ATA/JASC applicability overrides. Global taxonomy stays shared; overrides filter or relabel codes per aircraft.';

-- ─── Shared classification columns ────────────────────────────────────────

ALTER TABLE compliance_items
  ADD COLUMN IF NOT EXISTS ata_code TEXT REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jasc_code TEXT REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_source TEXT CHECK (classification_source IS NULL OR classification_source IN ('manual', 'suggested', 'template', 'imported', 'ai', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_confidence TEXT CHECK (classification_confidence IS NULL OR classification_confidence IN ('high', 'medium', 'low', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_status TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable'));

ALTER TABLE continued_items
  ADD COLUMN IF NOT EXISTS ata_code TEXT REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jasc_code TEXT REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_source TEXT CHECK (classification_source IS NULL OR classification_source IN ('manual', 'suggested', 'template', 'imported', 'ai', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_confidence TEXT CHECK (classification_confidence IS NULL OR classification_confidence IN ('high', 'medium', 'low', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_status TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable'));

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS primary_ata_code TEXT REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_jasc_code TEXT REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_source TEXT CHECK (classification_source IS NULL OR classification_source IN ('manual', 'suggested', 'template', 'imported', 'ai', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_confidence TEXT CHECK (classification_confidence IS NULL OR classification_confidence IN ('high', 'medium', 'low', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_status TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable'));

ALTER TABLE work_order_lines
  ADD COLUMN IF NOT EXISTS ata_code TEXT REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jasc_code TEXT REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_source TEXT CHECK (classification_source IS NULL OR classification_source IN ('manual', 'suggested', 'template', 'imported', 'ai', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_confidence TEXT CHECK (classification_confidence IS NULL OR classification_confidence IN ('high', 'medium', 'low', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_status TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable'));

ALTER TABLE work_order_checklist_items
  ADD COLUMN IF NOT EXISTS ata_code TEXT REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jasc_code TEXT REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_source TEXT CHECK (classification_source IS NULL OR classification_source IN ('manual', 'suggested', 'template', 'imported', 'ai', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_confidence TEXT CHECK (classification_confidence IS NULL OR classification_confidence IN ('high', 'medium', 'low', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_status TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable'));

ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS ata_code TEXT REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jasc_code TEXT REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_source TEXT CHECK (classification_source IS NULL OR classification_source IN ('manual', 'suggested', 'template', 'imported', 'ai', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_confidence TEXT CHECK (classification_confidence IS NULL OR classification_confidence IN ('high', 'medium', 'low', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_status TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable'));

ALTER TABLE inventory_parts
  ADD COLUMN IF NOT EXISTS ata_code TEXT REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jasc_code TEXT REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_status TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable'));

ALTER TABLE parts_library
  ADD COLUMN IF NOT EXISTS ata_code TEXT REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jasc_code TEXT REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_status TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable'));

ALTER TABLE squawks
  ADD COLUMN IF NOT EXISTS suggested_ata_code TEXT REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_jasc_code TEXT REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_ata_code TEXT REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_jasc_code TEXT REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_source TEXT CHECK (classification_source IS NULL OR classification_source IN ('manual', 'suggested', 'template', 'imported', 'ai', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_confidence TEXT CHECK (classification_confidence IS NULL OR classification_confidence IN ('high', 'medium', 'low', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_status TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable'));

ALTER TABLE logbook_entries
  ADD COLUMN IF NOT EXISTS ata_code TEXT REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jasc_code TEXT REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_source TEXT CHECK (classification_source IS NULL OR classification_source IN ('manual', 'suggested', 'template', 'imported', 'ai', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_confidence TEXT CHECK (classification_confidence IS NULL OR classification_confidence IN ('high', 'medium', 'low', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_status TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable'));

ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS ata_code TEXT REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jasc_code TEXT REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_source TEXT CHECK (classification_source IS NULL OR classification_source IN ('manual', 'suggested', 'template', 'imported', 'ai', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_confidence TEXT CHECK (classification_confidence IS NULL OR classification_confidence IN ('high', 'medium', 'low', 'unknown')),
  ADD COLUMN IF NOT EXISTS classification_status TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable'));

-- Explicit work-order to JASC bridge for multi-system work orders and future
-- classifier outputs. Task/line rows remain the execution source of truth.
CREATE TABLE IF NOT EXISTS work_order_jasc_references (
  work_order_id          UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  jasc_code              TEXT NOT NULL REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE CASCADE,
  ata_code               TEXT NOT NULL REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE CASCADE,
  classifier_confidence  NUMERIC(5,4),
  human_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (work_order_id, jasc_code)
);

CREATE INDEX IF NOT EXISTS idx_wo_jasc_refs_org_code
  ON work_order_jasc_references (organization_id, ata_code, jasc_code);

ALTER TABLE work_order_jasc_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_jasc_refs_read ON work_order_jasc_references;
CREATE POLICY wo_jasc_refs_read ON work_order_jasc_references
  FOR SELECT USING (organization_id = ANY(get_my_org_ids()));

DROP POLICY IF EXISTS wo_jasc_refs_write ON work_order_jasc_references;
CREATE POLICY wo_jasc_refs_write ON work_order_jasc_references
  FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

GRANT SELECT, INSERT, UPDATE, DELETE ON work_order_jasc_references TO authenticated;

CREATE INDEX IF NOT EXISTS idx_compliance_items_taxonomy ON compliance_items(organization_id, ata_code, jasc_code);
CREATE INDEX IF NOT EXISTS idx_continued_items_taxonomy ON continued_items(organization_id, ata_code, jasc_code);
CREATE INDEX IF NOT EXISTS idx_work_orders_taxonomy ON work_orders(organization_id, primary_ata_code, primary_jasc_code);
CREATE INDEX IF NOT EXISTS idx_wo_lines_taxonomy ON work_order_lines(organization_id, ata_code, jasc_code);
CREATE INDEX IF NOT EXISTS idx_wo_checklist_taxonomy ON work_order_checklist_items(organization_id, ata_code, jasc_code);
CREATE INDEX IF NOT EXISTS idx_estimate_lines_taxonomy ON estimate_line_items(organization_id, ata_code, jasc_code);
CREATE INDEX IF NOT EXISTS idx_inventory_parts_taxonomy ON inventory_parts(organization_id, ata_code, jasc_code);
CREATE INDEX IF NOT EXISTS idx_parts_library_taxonomy ON parts_library(organization_id, ata_code, jasc_code);
CREATE INDEX IF NOT EXISTS idx_squawks_taxonomy_confirmed ON squawks(organization_id, confirmed_ata_code, confirmed_jasc_code);
CREATE INDEX IF NOT EXISTS idx_squawks_taxonomy_suggested ON squawks(organization_id, suggested_ata_code, suggested_jasc_code);
CREATE INDEX IF NOT EXISTS idx_logbook_entries_taxonomy ON logbook_entries(organization_id, ata_code, jasc_code);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_taxonomy ON invoice_line_items(organization_id, ata_code, jasc_code);

COMMENT ON COLUMN work_orders.primary_ata_code IS 'Primary ATA chapter for list/report grouping. Detailed execution classification lives on work_order_lines and checklist items.';
COMMENT ON COLUMN work_order_lines.ata_code IS 'Line-level ATA classification. Nullable so uncoded work can be created and cleaned up later.';
COMMENT ON COLUMN squawks.confirmed_jasc_code IS 'Mechanic/admin-confirmed JASC code. Suggested codes remain separate and require confirmation.';
COMMENT ON COLUMN logbook_entries.jasc_code IS 'Structured classification metadata; the narrative remains human-readable.';
