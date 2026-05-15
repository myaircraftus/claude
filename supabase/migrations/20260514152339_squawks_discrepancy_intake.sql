-- Squawks / Discrepancy Intake source-of-truth layer.
-- Extends the older aircraft-linked squawk rows into an auditable intake,
-- evidence, AI draft, routing, owner-visibility, and resolution workflow.

ALTER TABLE squawks DROP CONSTRAINT IF EXISTS squawks_status_check;
ALTER TABLE squawks ADD CONSTRAINT squawks_status_check CHECK (
  status IN (
    'draft',
    'open',
    'acknowledged',
    'needs_review',
    'high_priority',
    'routed_to_estimate',
    'awaiting_owner_approval',
    'added_to_work_order',
    'in_work_order',
    'in_progress',
    'waiting_for_parts',
    'deferred',
    'resolved',
    'closed_duplicate',
    'closed_not_reproducible',
    'closed_owner_declined',
    'archived'
  )
);

ALTER TABLE squawks DROP CONSTRAINT IF EXISTS squawks_severity_check;
ALTER TABLE squawks ADD CONSTRAINT squawks_severity_check CHECK (
  severity IN (
    'minor',
    'normal',
    'urgent',
    'grounding',
    'critical',
    'high',
    'medium',
    'low',
    'cosmetic',
    'needs_review'
  )
);

ALTER TABLE squawks DROP CONSTRAINT IF EXISTS squawks_source_check;
ALTER TABLE squawks ADD CONSTRAINT squawks_source_check CHECK (
  source IN (
    'manual',
    'voice',
    'photo',
    'flight_schedule_pro',
    'mobile_app',
    'dictation',
    'photo_video',
    'file_upload',
    'paper_ocr',
    'owner_portal',
    'checklist_failure',
    'ai_intake',
    'document_upload',
    'aircraft_workspace',
    'global_queue',
    'work_order',
    'estimate'
  )
);

ALTER TABLE squawks ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS reported_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS owner_visible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS current_route_type TEXT;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS linked_estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS linked_task_id UUID;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS linked_checklist_item_id UUID;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS verified_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS owner_summary TEXT;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS closure_reason TEXT;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS closure_notes TEXT;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS duplicate_of_squawk_id UUID REFERENCES squawks(id) ON DELETE SET NULL;
ALTER TABLE squawks ADD COLUMN IF NOT EXISTS offline_draft_key TEXT;

UPDATE squawks
SET
  created_by_user_id = COALESCE(created_by_user_id, reported_by),
  reported_by_user_id = COALESCE(reported_by_user_id, reported_by)
WHERE reported_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_squawks_org_status_created
  ON squawks (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_squawks_aircraft_status_created
  ON squawks (aircraft_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_squawks_owner_visible
  ON squawks (organization_id, owner_visible, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_squawks_linked_estimate
  ON squawks (linked_estimate_id)
  WHERE linked_estimate_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS squawk_evidence (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  squawk_id       UUID NOT NULL REFERENCES squawks(id) ON DELETE CASCADE,
  uploaded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  evidence_type   TEXT NOT NULL CHECK (
    evidence_type IN ('photo', 'video', 'voice', 'file', 'paper_ocr', 'owner_media', 'transcript')
  ),
  file_name       TEXT,
  file_type       TEXT,
  storage_path    TEXT,
  public_url      TEXT,
  transcript      TEXT,
  ocr_text        TEXT,
  internal_only   BOOLEAN NOT NULL DEFAULT TRUE,
  owner_visible   BOOLEAN NOT NULL DEFAULT FALSE,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_squawk_evidence_squawk
  ON squawk_evidence (squawk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_squawk_evidence_org
  ON squawk_evidence (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS squawk_ai_drafts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  squawk_id              UUID REFERENCES squawks(id) ON DELETE CASCADE,
  prompt                 TEXT,
  transcript             TEXT,
  attachments            JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_output_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_title        TEXT,
  suggested_description  TEXT,
  suggested_category     TEXT,
  suggested_severity     TEXT,
  suggested_route        TEXT,
  confidence             NUMERIC,
  warnings               JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                 TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('suggested', 'draft', 'needs_review', 'accepted', 'rejected', 'superseded')),
  created_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_squawk_ai_drafts_squawk
  ON squawk_ai_drafts (squawk_id, created_at DESC)
  WHERE squawk_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_squawk_ai_drafts_org
  ON squawk_ai_drafts (organization_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_squawk_ai_drafts_updated_at ON squawk_ai_drafts;
CREATE TRIGGER trg_squawk_ai_drafts_updated_at
  BEFORE UPDATE ON squawk_ai_drafts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS squawk_routes (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  squawk_id          UUID NOT NULL REFERENCES squawks(id) ON DELETE CASCADE,
  route_type         TEXT NOT NULL CHECK (
    route_type IN ('existing_work_order', 'new_work_order', 'estimate', 'owner_approval', 'defer', 'close', 'duplicate', 'no_action')
  ),
  target_record_type TEXT,
  target_record_id   UUID,
  notes              TEXT,
  owner_visible      BOOLEAN NOT NULL DEFAULT FALSE,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_squawk_routes_squawk
  ON squawk_routes (squawk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_squawk_routes_org
  ON squawk_routes (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS squawk_status_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  squawk_id       UUID NOT NULL REFERENCES squawks(id) ON DELETE CASCADE,
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  reason          TEXT,
  notes           TEXT,
  actor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_squawk_status_history_squawk
  ON squawk_status_history (squawk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_squawk_status_history_org
  ON squawk_status_history (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS squawk_owner_visibility (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  squawk_id              UUID NOT NULL REFERENCES squawks(id) ON DELETE CASCADE,
  owner_visible          BOOLEAN NOT NULL DEFAULT FALSE,
  sanitized_title        TEXT,
  sanitized_description  TEXT,
  visible_fields         JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (squawk_id)
);

CREATE INDEX IF NOT EXISTS idx_squawk_owner_visibility_org
  ON squawk_owner_visibility (organization_id, owner_visible, updated_at DESC);

DROP TRIGGER IF EXISTS trg_squawk_owner_visibility_updated_at ON squawk_owner_visibility;
CREATE TRIGGER trg_squawk_owner_visibility_updated_at
  BEFORE UPDATE ON squawk_owner_visibility
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS squawk_resolutions (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  squawk_id                UUID NOT NULL REFERENCES squawks(id) ON DELETE CASCADE,
  resolution_type          TEXT NOT NULL CHECK (
    resolution_type IN (
      'resolved_by_work_order',
      'deferred',
      'duplicate',
      'not_reproducible',
      'owner_declined',
      'entered_in_error',
      'no_action_required'
    )
  ),
  linked_work_order_id      UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  linked_estimate_id        UUID REFERENCES estimates(id) ON DELETE SET NULL,
  duplicate_of_squawk_id    UUID REFERENCES squawks(id) ON DELETE SET NULL,
  notes                     TEXT,
  attachments               JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_squawk_resolutions_squawk
  ON squawk_resolutions (squawk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_squawk_resolutions_org
  ON squawk_resolutions (organization_id, created_at DESC);

ALTER TABLE squawk_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE squawk_ai_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE squawk_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE squawk_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE squawk_owner_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE squawk_resolutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS squawk_evidence_select ON squawk_evidence;
CREATE POLICY squawk_evidence_select ON squawk_evidence FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS squawk_evidence_write ON squawk_evidence;
CREATE POLICY squawk_evidence_write ON squawk_evidence FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS squawk_ai_drafts_select ON squawk_ai_drafts;
CREATE POLICY squawk_ai_drafts_select ON squawk_ai_drafts FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS squawk_ai_drafts_write ON squawk_ai_drafts;
CREATE POLICY squawk_ai_drafts_write ON squawk_ai_drafts FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS squawk_routes_select ON squawk_routes;
CREATE POLICY squawk_routes_select ON squawk_routes FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS squawk_routes_write ON squawk_routes;
CREATE POLICY squawk_routes_write ON squawk_routes FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS squawk_status_history_select ON squawk_status_history;
CREATE POLICY squawk_status_history_select ON squawk_status_history FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS squawk_status_history_insert ON squawk_status_history;
CREATE POLICY squawk_status_history_insert ON squawk_status_history FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

DROP POLICY IF EXISTS squawk_owner_visibility_select ON squawk_owner_visibility;
CREATE POLICY squawk_owner_visibility_select ON squawk_owner_visibility FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS squawk_owner_visibility_write ON squawk_owner_visibility;
CREATE POLICY squawk_owner_visibility_write ON squawk_owner_visibility FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

DROP POLICY IF EXISTS squawk_resolutions_select ON squawk_resolutions;
CREATE POLICY squawk_resolutions_select ON squawk_resolutions FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
DROP POLICY IF EXISTS squawk_resolutions_write ON squawk_resolutions;
CREATE POLICY squawk_resolutions_write ON squawk_resolutions FOR ALL
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']))
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  squawk_evidence,
  squawk_ai_drafts,
  squawk_routes,
  squawk_status_history,
  squawk_owner_visibility,
  squawk_resolutions
TO authenticated;

COMMENT ON TABLE squawk_evidence IS 'Squawk evidence attachments, transcripts, OCR text, and owner visibility metadata.';
COMMENT ON TABLE squawk_ai_drafts IS 'AI-structured squawk drafts. Human verification is required before official save.';
COMMENT ON TABLE squawk_routes IS 'Routing decisions from squawk to estimate, work order, owner approval, deferral, or closure.';
COMMENT ON TABLE squawk_status_history IS 'Immutable squawk lifecycle status history.';
COMMENT ON TABLE squawk_owner_visibility IS 'Sanitized owner-facing projection controls for squawks.';
COMMENT ON TABLE squawk_resolutions IS 'Audit-preserving squawk closure and resolution records.';
