-- Three slim base tables for compliance + sales workflows that
-- existing agents (compliance.audit-event-watchdog,
-- compliance.dpa-anniversary-reviewer, sales.review-request-timer)
-- have been tolerantly checking for. Once these exist, those agents
-- switch from "table missing — no-op" to actually finding records.
--
-- Schemas are intentionally minimal — future expansions can ALTER
-- TABLE ADD COLUMN without breaking existing readers.

-- 1) audit_event — append-only audit log with monotonic sequence.
-- Used by compliance.audit-event-watchdog (detects gaps / stale /
-- backdated rows). Writers should INSERT only; sequence is generated
-- by default via the sequence object so concurrent inserts don't
-- conflict.
CREATE TABLE IF NOT EXISTS public.audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigserial NOT NULL,
  kind text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid,
  target_kind text,
  target_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_event_sequence_idx
  ON public.audit_event (sequence);
CREATE INDEX IF NOT EXISTS audit_event_created_at_idx
  ON public.audit_event (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_actor_idx
  ON public.audit_event (actor_user_id) WHERE actor_user_id IS NOT NULL;
ALTER TABLE public.audit_event ENABLE ROW LEVEL SECURITY;

-- Service role writes; platform admins can read their own org's events
-- and the system-wide stream (org_id IS NULL).
DROP POLICY IF EXISTS audit_event_admin_read ON public.audit_event;
CREATE POLICY audit_event_admin_read ON public.audit_event
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
       WHERE user_profiles.id = auth.uid()
         AND user_profiles.is_platform_admin = true
    )
  );

-- 2) dpa_signatures — one row per (org, signer, signed_at). Tracks
-- the 12-month re-review anniversary used by
-- compliance.dpa-anniversary-reviewer.
CREATE TABLE IF NOT EXISTS public.dpa_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  signer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  signer_email text,
  signer_name text,
  dpa_version text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  signed_ip inet,
  sub_processor_list_hash text,
  document_url text,
  withdrawn_at timestamptz
);
CREATE INDEX IF NOT EXISTS dpa_signatures_org_signed_idx
  ON public.dpa_signatures (organization_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS dpa_signatures_anniversary_idx
  ON public.dpa_signatures (signed_at) WHERE withdrawn_at IS NULL;
ALTER TABLE public.dpa_signatures ENABLE ROW LEVEL SECURITY;
-- Members can read their own org's DPAs
DROP POLICY IF EXISTS dpa_signatures_member_read ON public.dpa_signatures;
CREATE POLICY dpa_signatures_member_read ON public.dpa_signatures
  FOR SELECT
  USING (
    organization_id IN (
      SELECT m.organization_id FROM public.organization_memberships m
       WHERE m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
       WHERE user_profiles.id = auth.uid()
         AND user_profiles.is_platform_admin = true
    )
  );

-- 3) review_requests — tracks every public-review ask made to a
-- customer (Trustpilot / G2 / Google). Used by
-- sales.review-request-timer to enforce a 6-month cooldown.
CREATE TABLE IF NOT EXISTS public.review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  platform text NOT NULL DEFAULT 'trustpilot',
  channel text DEFAULT 'email',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'opened', 'clicked', 'submitted', 'declined', 'failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  submitted_at timestamptz,
  notes text
);
CREATE INDEX IF NOT EXISTS review_requests_org_requested_idx
  ON public.review_requests (organization_id, requested_at DESC);
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS review_requests_admin_read ON public.review_requests;
CREATE POLICY review_requests_admin_read ON public.review_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
       WHERE user_profiles.id = auth.uid()
         AND user_profiles.is_platform_admin = true
    )
  );
