-- Sprint 8.7 — Vision Review Queue + Feedback (Phase 8).
--
-- ⚠ NOT APPLIED — Andy applies via psql or apps/web/scripts/apply-100.ts
--   (run order: 100 only, no dependency on uncreated tables).
--
-- Two tables:
--
--   vision_review_queue
--     Surfaces pages that need human eyes — either because retrieval
--     gave a low confidence score (auto-enqueued from /api/vision/answer
--     when fallback fires) or because indexing failed on > 50% of a
--     job's pages (auto-enqueued from the dispatcher).
--     Operators triage from /admin/vision/review.
--
--   vision_feedback
--     Per-(query, page) thumbs-up/down/neutral feedback. Aggregated
--     into the confidence calibrator (Sprint 8.8) so a page that
--     consistently gets thumbs-up for "annual inspection" queries
--     scores higher next time. One row per (user, query, page).
--
-- Both are soft-deletable on vision_review_queue; vision_feedback is
-- append-only (deletion would distort the calibration history).

-- ─── vision_review_queue ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vision_review_queue (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vision_page_id      uuid NOT NULL REFERENCES vision_pages(id) ON DELETE CASCADE,
  search_query        text,
  confidence_score    numeric,
  reason              text NOT NULL
    CHECK (reason IN ('low_confidence','failed_index','user_flag')),
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','reviewed_ok','reviewed_problem','dismissed')),
  reviewer_user_id    uuid,
  reviewer_notes      text,
  reviewed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE INDEX IF NOT EXISTS vision_review_queue_org_status_idx
  ON vision_review_queue (organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vision_review_queue_page_idx
  ON vision_review_queue (vision_page_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vision_review_queue_recent_pending_idx
  ON vision_review_queue (organization_id, created_at DESC)
  WHERE status = 'pending' AND deleted_at IS NULL;

ALTER TABLE vision_review_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read vision_review_queue" ON vision_review_queue;
CREATE POLICY "Org members read vision_review_queue"
  ON vision_review_queue FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

DROP POLICY IF EXISTS "Admin write vision_review_queue" ON vision_review_queue;
CREATE POLICY "Admin write vision_review_queue"
  ON vision_review_queue FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND role IN ('owner','admin')
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND role IN ('owner','admin')
  ));

-- ─── vision_feedback ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vision_feedback (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  search_query        text NOT NULL,
  vision_page_id      uuid NOT NULL REFERENCES vision_pages(id) ON DELETE CASCADE,
  rating              int NOT NULL CHECK (rating IN (-1, 0, 1)),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- One feedback row per (user × query × page). Toggling a thumb
-- twice should NOT create two rows (upsert path).
CREATE UNIQUE INDEX IF NOT EXISTS vision_feedback_user_query_page_unique
  ON vision_feedback (user_id, search_query, vision_page_id);

CREATE INDEX IF NOT EXISTS vision_feedback_org_query_idx
  ON vision_feedback (organization_id, search_query);

CREATE INDEX IF NOT EXISTS vision_feedback_org_page_idx
  ON vision_feedback (organization_id, vision_page_id);

ALTER TABLE vision_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read vision_feedback" ON vision_feedback;
CREATE POLICY "Org members read vision_feedback"
  ON vision_feedback FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

DROP POLICY IF EXISTS "Self write vision_feedback" ON vision_feedback;
CREATE POLICY "Self write vision_feedback"
  ON vision_feedback FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── updated_at trigger on vision_review_queue ───────────────────────

CREATE OR REPLACE FUNCTION trg_vision_review_queue_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vision_review_queue_set_updated_at ON vision_review_queue;
CREATE TRIGGER vision_review_queue_set_updated_at
  BEFORE UPDATE ON vision_review_queue
  FOR EACH ROW EXECUTE FUNCTION trg_vision_review_queue_set_updated_at();

COMMENT ON TABLE  vision_review_queue IS 'Pages flagged for human triage (Phase 8 Sprint 8.7).';
COMMENT ON COLUMN vision_review_queue.reason IS 'low_confidence (retrieval threshold) | failed_index (>50% of job failed) | user_flag (manual)';
COMMENT ON COLUMN vision_review_queue.status IS 'pending → reviewed_ok | reviewed_problem | dismissed (terminal)';

COMMENT ON TABLE  vision_feedback IS 'Per-(user × query × page) thumbs-up/down/neutral. Feeds confidence calibration in Sprint 8.8.';
COMMENT ON COLUMN vision_feedback.rating IS '-1 (down) | 0 (neutral) | 1 (up). Append-only — deletion would distort calibration.';
