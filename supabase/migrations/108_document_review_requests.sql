-- Migration 108: Phase 14 — document_review_requests workflow table
--
-- Tracks customer requests for human review (Standard QA or Expert A&P).
-- In v1 this is a workflow record only — billing is gated by the
-- HUMAN_REVIEW_BILLING_ENABLED env var (default false). When v2 launches
-- the billing flag flips and these rows trigger Stripe charges.

BEGIN;

CREATE TABLE IF NOT EXISTS document_review_requests (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id             UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by_user_id    UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  review_type             TEXT NOT NULL,
  estimated_hours         NUMERIC,
  estimated_cost_cents    INTEGER,
  hourly_rate_cents       INTEGER,
  status                  TEXT NOT NULL DEFAULT 'requested',
  assigned_reviewer_id    UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  started_at              TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ,

  CONSTRAINT document_review_requests_review_type_check
    CHECK (review_type IN ('expert_ap', 'standard_qa', 'skip')),
  CONSTRAINT document_review_requests_status_check
    CHECK (status IN ('requested', 'in_progress', 'completed', 'declined'))
);

CREATE INDEX IF NOT EXISTS idx_drr_document
  ON document_review_requests (document_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drr_org_status
  ON document_review_requests (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drr_assigned_reviewer
  ON document_review_requests (assigned_reviewer_id, status)
  WHERE assigned_reviewer_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE document_review_requests IS
  'Phase 14: customer requests for human review. In v1 this is workflow-only; billing gated by HUMAN_REVIEW_BILLING_ENABLED env var.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_drr_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drr_updated_at ON document_review_requests;
CREATE TRIGGER trg_drr_updated_at
  BEFORE UPDATE ON document_review_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_drr_updated_at();

-- RLS — org members read their own; only admins write
ALTER TABLE document_review_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drr_select" ON document_review_requests;
CREATE POLICY "drr_select" ON document_review_requests FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));

DROP POLICY IF EXISTS "drr_insert" ON document_review_requests;
CREATE POLICY "drr_insert" ON document_review_requests FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

-- Updates only by platform admin or the assigned reviewer.
DROP POLICY IF EXISTS "drr_update" ON document_review_requests;
CREATE POLICY "drr_update" ON document_review_requests FOR UPDATE
  USING (
    user_persona_in_org(organization_id) = 'admin'
    OR assigned_reviewer_id = auth.uid()
  );

COMMIT;
