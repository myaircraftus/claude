-- Migration: Aircraft Workspace v2
--
-- Adds the source-of-truth support tables for the selected-aircraft workspace:
-- identity/profile metadata, generated media, verified-vs-estimated time
-- ledger/snapshot, aircraft due items, aircraft timeline projection, and
-- AI suggestions that stay draft/suggested until human accepted.

ALTER TABLE aircraft
  ADD COLUMN IF NOT EXISTS aircraft_workspace_status TEXT NOT NULL DEFAULT 'active'
    CHECK (aircraft_workspace_status IN ('active', 'in_maintenance', 'grounded', 'archived', 'needs_review')),
  ADD COLUMN IF NOT EXISTS registered_owner_name TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_payer_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aircraft_category TEXT,
  ADD COLUMN IF NOT EXISTS aircraft_class TEXT,
  ADD COLUMN IF NOT EXISTS engine_type TEXT,
  ADD COLUMN IF NOT EXISTS engine_count INTEGER CHECK (engine_count IS NULL OR engine_count >= 0),
  ADD COLUMN IF NOT EXISTS home_base TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_program_type TEXT
    CHECK (maintenance_program_type IS NULL OR maintenance_program_type IN (
      'annual', '100_hour', 'progressive', 'manufacturer_program', 'part_135_program', 'custom', 'unknown'
    )),
  ADD COLUMN IF NOT EXISTS primary_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS silhouette_style TEXT NOT NULL DEFAULT 'unknown'
    CHECK (silhouette_style IN ('single_engine_piston', 'multi_engine_piston', 'turboprop', 'jet', 'helicopter', 'glider', 'unknown')),
  ADD COLUMN IF NOT EXISTS registry_source TEXT,
  ADD COLUMN IF NOT EXISTS registry_status TEXT,
  ADD COLUMN IF NOT EXISTS registry_lookup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS registry_raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS identity_review_status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (identity_review_status IN ('confirmed', 'needs_review', 'manual')),
  ADD COLUMN IF NOT EXISTS time_source_preference TEXT NOT NULL DEFAULT 'manual'
    CHECK (time_source_preference IN ('manual', 'airbly', 'scheduling', 'adsb_estimate', 'mixed'));

CREATE INDEX IF NOT EXISTS idx_aircraft_workspace_status
  ON aircraft (organization_id, aircraft_workspace_status);
CREATE INDEX IF NOT EXISTS idx_aircraft_maintenance_payer
  ON aircraft (maintenance_payer_customer_id) WHERE maintenance_payer_customer_id IS NOT NULL;

-- ─── Aircraft media ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS aircraft_media (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id     UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  media_type      TEXT NOT NULL DEFAULT 'silhouette'
                  CHECK (media_type IN ('silhouette', 'photo', 'document_preview')),
  url             TEXT,
  svg_markup      TEXT,
  alt_text        TEXT,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  source          TEXT NOT NULL DEFAULT 'generated'
                  CHECK (source IN ('generated', 'uploaded', 'document', 'imported')),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aircraft_media_aircraft
  ON aircraft_media (aircraft_id, is_primary DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aircraft_media_org
  ON aircraft_media (organization_id);

DROP TRIGGER IF EXISTS trg_aircraft_media_updated_at ON aircraft_media;
CREATE TRIGGER trg_aircraft_media_updated_at
  BEFORE UPDATE ON aircraft_media
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── Aircraft time ledger and snapshot ────────────────────────────────────

CREATE TABLE IF NOT EXISTS aircraft_time_entries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id         UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  time_type           TEXT NOT NULL
                      CHECK (time_type IN (
                        'tach', 'hobbs', 'total_time', 'engine_1', 'engine_2',
                        'prop_1', 'prop_2', 'cycles', 'landings'
                      )),
  value               NUMERIC(12,4) NOT NULL CHECK (value >= 0),
  observed_at         TIMESTAMPTZ NOT NULL,
  source              TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN (
                        'mechanic_verified', 'owner_entered', 'work_order_closeout',
                        'logbook', 'airbly', 'scheduling', 'adsb_estimate', 'manual', 'imported'
                      )),
  confidence          TEXT NOT NULL DEFAULT 'medium'
                      CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
  is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  source_record_type  TEXT,
  source_record_id    UUID,
  notes               TEXT,
  recorded_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at           TIMESTAMPTZ,
  voided_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aircraft_time_entries_current
  ON aircraft_time_entries (aircraft_id, time_type, observed_at DESC, created_at DESC)
  WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_aircraft_time_entries_org
  ON aircraft_time_entries (organization_id, observed_at DESC);

DROP TRIGGER IF EXISTS trg_aircraft_time_entries_updated_at ON aircraft_time_entries;
CREATE TRIGGER trg_aircraft_time_entries_updated_at
  BEFORE UPDATE ON aircraft_time_entries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS aircraft_time_snapshots (
  aircraft_id                 UUID PRIMARY KEY REFERENCES aircraft(id) ON DELETE CASCADE,
  organization_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  verified_tach               NUMERIC(12,4),
  verified_hobbs              NUMERIC(12,4),
  verified_total_time         NUMERIC(12,4),
  verified_cycles             INTEGER,
  verified_landings           INTEGER,
  verified_at                 TIMESTAMPTZ,
  verified_source             TEXT,
  estimated_tach              NUMERIC(12,4),
  estimated_hobbs             NUMERIC(12,4),
  estimated_total_time        NUMERIC(12,4),
  estimated_cycles            INTEGER,
  estimated_landings          INTEGER,
  estimated_at                TIMESTAMPTZ,
  estimated_source            TEXT,
  estimate_confidence         TEXT CHECK (estimate_confidence IS NULL OR estimate_confidence IN ('high', 'medium', 'low', 'unknown')),
  last_entry_id               UUID REFERENCES aircraft_time_entries(id) ON DELETE SET NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aircraft_time_snapshots_org
  ON aircraft_time_snapshots (organization_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_aircraft_time_snapshots_updated_at ON aircraft_time_snapshots;
CREATE TRIGGER trg_aircraft_time_snapshots_updated_at
  BEFORE UPDATE ON aircraft_time_snapshots
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── Due list engine ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS aircraft_due_items (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id                UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  title                      TEXT NOT NULL,
  description                TEXT,
  status                     TEXT NOT NULL DEFAULT 'needs_review'
                             CHECK (status IN (
                               'overdue', 'due_now', 'due_soon', 'upcoming',
                               'complied', 'deferred', 'not_applicable', 'needs_review'
                             )),
  ata_code                   TEXT REFERENCES ata_chapters(ata_code) ON UPDATE CASCADE ON DELETE SET NULL,
  jasc_code                  TEXT REFERENCES jasc_codes(jasc_code) ON UPDATE CASCADE ON DELETE SET NULL,
  business_category          TEXT,
  source_type                TEXT NOT NULL DEFAULT 'manual'
                             CHECK (source_type IN (
                               'ai', 'manual', 'maintenance_program', 'ad', 'sb',
                               'manufacturer', 'shop_template', 'work_order', 'owner_reminder', 'imported_record'
                             )),
  source_reference           TEXT,
  due_basis                  TEXT NOT NULL DEFAULT 'calendar'
                             CHECK (due_basis IN ('calendar', 'tach', 'hobbs', 'total_time', 'cycles', 'event', 'mixed')),
  last_done_date             DATE,
  last_done_tach             NUMERIC(12,4),
  last_done_hobbs            NUMERIC(12,4),
  last_done_total_time       NUMERIC(12,4),
  last_done_cycles           INTEGER,
  next_due_date              DATE,
  next_due_tach              NUMERIC(12,4),
  next_due_hobbs             NUMERIC(12,4),
  next_due_total_time        NUMERIC(12,4),
  next_due_cycles            INTEGER,
  forecast_due_date          DATE,
  confidence                 TEXT NOT NULL DEFAULT 'unknown'
                             CHECK (confidence IN ('high', 'medium', 'low', 'unknown', 'needs_review')),
  classification_source      TEXT CHECK (classification_source IS NULL OR classification_source IN ('manual', 'suggested', 'template', 'imported', 'ai', 'unknown')),
  classification_confidence  TEXT CHECK (classification_confidence IS NULL OR classification_confidence IN ('high', 'medium', 'low', 'unknown')),
  classification_status      TEXT NOT NULL DEFAULT 'unclassified'
                             CHECK (classification_status IN ('classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable')),
  owner_visible              BOOLEAN NOT NULL DEFAULT FALSE,
  review_state               TEXT NOT NULL DEFAULT 'needs_review'
                             CHECK (review_state IN ('suggested', 'draft', 'needs_review', 'accepted', 'rejected', 'superseded')),
  linked_estimate_id         UUID REFERENCES estimates(id) ON DELETE SET NULL,
  linked_work_order_id       UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  linked_logbook_entry_id    UUID REFERENCES logbook_entries(id) ON DELETE SET NULL,
  linked_compliance_item_id  UUID REFERENCES compliance_items(id) ON DELETE SET NULL,
  created_by                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                 TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_aircraft_due_items_aircraft
  ON aircraft_due_items (aircraft_id, status, next_due_date NULLS LAST)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_aircraft_due_items_org_status
  ON aircraft_due_items (organization_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_aircraft_due_items_taxonomy
  ON aircraft_due_items (ata_code, jasc_code)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_aircraft_due_items_updated_at ON aircraft_due_items;
CREATE TRIGGER trg_aircraft_due_items_updated_at
  BEFORE UPDATE ON aircraft_due_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── Timeline projection and AI suggestion log ────────────────────────────

CREATE TABLE IF NOT EXISTS aircraft_timeline_events (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id         UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  module              TEXT NOT NULL,
  action              TEXT NOT NULL,
  source_record_type  TEXT,
  source_record_id    UUID,
  title               TEXT NOT NULL,
  summary             TEXT,
  owner_visible       BOOLEAN NOT NULL DEFAULT FALSE,
  actor_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aircraft_timeline_events_aircraft
  ON aircraft_timeline_events (aircraft_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_aircraft_timeline_events_org
  ON aircraft_timeline_events (organization_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id         UUID REFERENCES aircraft(id) ON DELETE CASCADE,
  module              TEXT NOT NULL,
  suggestion_type     TEXT NOT NULL,
  title               TEXT NOT NULL,
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL DEFAULT 'suggested'
                      CHECK (status IN ('suggested', 'draft', 'needs_review', 'accepted', 'rejected', 'superseded')),
  confidence          TEXT NOT NULL DEFAULT 'unknown'
                      CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
  source_context      TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_aircraft
  ON ai_suggestions (aircraft_id, status, created_at DESC)
  WHERE aircraft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_org
  ON ai_suggestions (organization_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_ai_suggestions_updated_at ON ai_suggestions;
CREATE TRIGGER trg_ai_suggestions_updated_at
  BEFORE UPDATE ON ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── RLS and explicit grants ──────────────────────────────────────────────

ALTER TABLE aircraft_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE aircraft_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE aircraft_time_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE aircraft_due_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE aircraft_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aircraft_media_select ON aircraft_media;
CREATE POLICY aircraft_media_select ON aircraft_media FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS aircraft_media_write ON aircraft_media;
CREATE POLICY aircraft_media_write ON aircraft_media FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS aircraft_time_entries_select ON aircraft_time_entries;
CREATE POLICY aircraft_time_entries_select ON aircraft_time_entries FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS aircraft_time_entries_write ON aircraft_time_entries;
CREATE POLICY aircraft_time_entries_write ON aircraft_time_entries FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic', 'pilot']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic', 'pilot']));

DROP POLICY IF EXISTS aircraft_time_snapshots_select ON aircraft_time_snapshots;
CREATE POLICY aircraft_time_snapshots_select ON aircraft_time_snapshots FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS aircraft_time_snapshots_write ON aircraft_time_snapshots;
CREATE POLICY aircraft_time_snapshots_write ON aircraft_time_snapshots FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic', 'pilot']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic', 'pilot']));

DROP POLICY IF EXISTS aircraft_due_items_select ON aircraft_due_items;
CREATE POLICY aircraft_due_items_select ON aircraft_due_items FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS aircraft_due_items_write ON aircraft_due_items;
CREATE POLICY aircraft_due_items_write ON aircraft_due_items FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS aircraft_timeline_events_select ON aircraft_timeline_events;
CREATE POLICY aircraft_timeline_events_select ON aircraft_timeline_events FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS aircraft_timeline_events_insert ON aircraft_timeline_events;
CREATE POLICY aircraft_timeline_events_insert ON aircraft_timeline_events FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

DROP POLICY IF EXISTS ai_suggestions_select ON ai_suggestions;
CREATE POLICY ai_suggestions_select ON ai_suggestions FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS ai_suggestions_write ON ai_suggestions;
CREATE POLICY ai_suggestions_write ON ai_suggestions FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  aircraft_media,
  aircraft_time_entries,
  aircraft_time_snapshots,
  aircraft_due_items,
  aircraft_timeline_events,
  ai_suggestions
TO authenticated;

COMMENT ON TABLE aircraft_media IS 'Aircraft photos and generated silhouettes. The default visual is generated, not scraped.';
COMMENT ON TABLE aircraft_time_entries IS 'Aircraft time ledger. Verified and estimated entries remain separate.';
COMMENT ON TABLE aircraft_time_snapshots IS 'Current aircraft time snapshot derived from aircraft_time_entries.';
COMMENT ON TABLE aircraft_due_items IS 'Aircraft-specific due list engine rows. AI rows stay suggested/draft until accepted.';
COMMENT ON TABLE aircraft_timeline_events IS 'Aircraft timeline projection. Source module records remain authoritative.';
COMMENT ON TABLE ai_suggestions IS 'Human-reviewed AI suggestions and drafts across aircraft workspace modules.';
