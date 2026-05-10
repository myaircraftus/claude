-- Migration 109: Phase 16 — Ops Command Center spine
--
-- Single-spine entity tables that all ops surfaces (support, errors,
-- alerts, feedback, churn) read from. Each type keeps its own table to
-- preserve type-specific columns; the unified `ops_inbox` VIEW unions
-- them with a common shape for the admin dashboard.
--
-- Spine contract (every entity exposes):
--   id, organization_id, severity (P0|P1|P2|P3), status, summary,
--   source_type, source_id, metadata jsonb, assigned_to, created_at,
--   resolved_at
--
-- AI tier model (Phase 16 lock):
--   T0 = auto-categorize/label/route   T1 = AI drafts response / auto-resolves
--   T2 = AI escalates to admin queue   T3 = AI generates Claude Code prompt
--
-- Escalation:  P0=instant  P1=15m  P2=1h  P3=daily-digest
--
-- This migration is NOT applied automatically. Andy applies via tsx-pg.

-- ──────────────────────────────────────────────────────────────────────
-- support_tickets
-- ──────────────────────────────────────────────────────────────────────

CREATE TYPE support_ticket_source AS ENUM (
  'web_form', 'email', 'in_app', 'admin_created'
);

CREATE TYPE support_ticket_category AS ENUM (
  'billing', 'technical', 'feature_request', 'bug', 'account', 'other'
);

CREATE TYPE ops_severity AS ENUM ('P0', 'P1', 'P2', 'P3');

CREATE TYPE support_ticket_status AS ENUM (
  'new', 'ai_triaging', 'awaiting_customer', 'awaiting_admin', 'resolved', 'closed'
);

CREATE TABLE support_tickets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid REFERENCES organizations(id) ON DELETE SET NULL,
  ticket_number       text NOT NULL UNIQUE,
  subject             text NOT NULL,
  body                text NOT NULL,
  submitter_email     text NOT NULL,
  submitter_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source              support_ticket_source NOT NULL DEFAULT 'web_form',
  category            support_ticket_category NOT NULL DEFAULT 'other',
  severity            ops_severity NOT NULL DEFAULT 'P3',
  status              support_ticket_status NOT NULL DEFAULT 'new',
  ai_first_response_at  timestamptz,
  ai_response_count   int NOT NULL DEFAULT 0,
  admin_assigned_to   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_first_response_at timestamptz,
  resolution_summary  text,
  related_doc_id      uuid REFERENCES documents(id) ON DELETE SET NULL,
  related_aircraft_id uuid REFERENCES aircraft(id) ON DELETE SET NULL,
  tags                text[] NOT NULL DEFAULT '{}',
  -- Token-based access for unauth submitters viewing their ticket.
  access_token        text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz,
  deleted_at          timestamptz
);

CREATE INDEX support_tickets_org_status_idx
  ON support_tickets(organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX support_tickets_severity_status_idx
  ON support_tickets(severity, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX support_tickets_submitter_idx
  ON support_tickets(submitter_user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX support_tickets_assigned_idx
  ON support_tickets(admin_assigned_to)
  WHERE deleted_at IS NULL AND status NOT IN ('resolved', 'closed');

-- Auto-generate ticket_number TKT-YYYYMMDD-NNNN. NNNN is daily counter.
CREATE OR REPLACE FUNCTION support_tickets_assign_number() RETURNS trigger AS $$
DECLARE
  prefix text;
  next_seq int;
BEGIN
  IF NEW.ticket_number IS NOT NULL AND NEW.ticket_number <> '' THEN
    RETURN NEW;
  END IF;

  prefix := to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYYMMDD');

  SELECT COUNT(*) + 1 INTO next_seq
  FROM support_tickets
  WHERE ticket_number LIKE 'TKT-' || prefix || '-%';

  NEW.ticket_number := 'TKT-' || prefix || '-' || lpad(next_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_tickets_assign_number_trg
  BEFORE INSERT ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION support_tickets_assign_number();

CREATE OR REPLACE FUNCTION support_tickets_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_tickets_touch_updated_at_trg
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION support_tickets_touch_updated_at();

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Org members see their org's tickets.
CREATE POLICY support_tickets_org_select ON support_tickets
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- Submitter can see their own tickets even cross-org.
CREATE POLICY support_tickets_submitter_select ON support_tickets
  FOR SELECT
  USING (submitter_user_id = auth.uid());

-- Platform admin sees everything.
CREATE POLICY support_tickets_admin_select ON support_tickets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

-- Authenticated insert: any authenticated user can create a ticket
-- against their own organization OR with NULL organization_id.
CREATE POLICY support_tickets_insert ON support_tickets
  FOR INSERT
  WITH CHECK (
    submitter_user_id = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      )
    )
  );

-- Update reserved for service role + admin.
CREATE POLICY support_tickets_admin_update ON support_tickets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

-- ──────────────────────────────────────────────────────────────────────
-- error_events  (server + client + ingestion)
-- ──────────────────────────────────────────────────────────────────────

CREATE TYPE error_event_status AS ENUM (
  'new', 'investigating', 'known_issue', 'resolved', 'wont_fix'
);

CREATE TYPE error_event_origin AS ENUM (
  'client', 'server_route', 'server_worker', 'ingestion'
);

CREATE TABLE error_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid REFERENCES organizations(id) ON DELETE SET NULL,
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  origin            error_event_origin NOT NULL,
  -- Stack hash groups identical errors together within a 1h window.
  stack_hash        text NOT NULL,
  message           text NOT NULL,
  stack             text,
  route             text,
  persona           text,
  build_sha         text,
  severity          ops_severity NOT NULL DEFAULT 'P2',
  status            error_event_status NOT NULL DEFAULT 'new',
  occurrence_count  int NOT NULL DEFAULT 1,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at       timestamptz,
  resolved_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Aggregation lookup: same stack_hash within 1h is the same group.
CREATE INDEX error_events_stack_recent_idx
  ON error_events(stack_hash, last_seen_at DESC);

CREATE INDEX error_events_status_severity_idx
  ON error_events(status, severity, last_seen_at DESC);

CREATE INDEX error_events_org_idx
  ON error_events(organization_id, last_seen_at DESC);

CREATE INDEX error_events_route_idx
  ON error_events(route, last_seen_at DESC) WHERE route IS NOT NULL;

ALTER TABLE error_events ENABLE ROW LEVEL SECURITY;

-- Errors are admin-only by default. Org members can see THEIR org's
-- errors for transparency on /status page.
CREATE POLICY error_events_admin_select ON error_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

CREATE POLICY error_events_org_select ON error_events
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- Inserts always via service role (no user-level INSERT policy).

-- ──────────────────────────────────────────────────────────────────────
-- alert_events  (system-level alarms)
-- ──────────────────────────────────────────────────────────────────────

CREATE TYPE alert_event_type AS ENUM (
  'worker_stale', 'queue_depth', 'cost_spike', 'failed_job_burst',
  'error_rate_spike', 'churn_burst', 'other'
);

CREATE TYPE alert_event_status AS ENUM (
  'firing', 'acknowledged', 'resolved'
);

CREATE TABLE alert_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  alert_type      alert_event_type NOT NULL,
  severity        ops_severity NOT NULL,
  status          alert_event_status NOT NULL DEFAULT 'firing',
  summary         text NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  fired_at        timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX alert_events_status_severity_idx
  ON alert_events(status, severity, fired_at DESC);

CREATE INDEX alert_events_type_idx
  ON alert_events(alert_type, status);

ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY alert_events_admin_select ON alert_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

-- Org-scoped alerts visible to that org.
CREATE POLICY alert_events_org_select ON alert_events
  FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- ──────────────────────────────────────────────────────────────────────
-- feedback_items
-- ──────────────────────────────────────────────────────────────────────

CREATE TYPE feedback_type AS ENUM (
  'nps', 'csat', 'feature_request', 'praise', 'complaint', 'thumbs'
);

CREATE TYPE feedback_sentiment AS ENUM (
  'positive', 'neutral', 'negative'
);

CREATE TYPE feedback_status AS ENUM ('new', 'reviewed', 'actioned');

CREATE TABLE feedback_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid REFERENCES organizations(id) ON DELETE SET NULL,
  submitter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type              feedback_type NOT NULL,
  -- 1..10 NPS, 1..5 CSAT, NULL otherwise.
  score             int CHECK (score IS NULL OR (score >= 1 AND score <= 10)),
  body              text,
  sentiment         feedback_sentiment NOT NULL DEFAULT 'neutral',
  source_page       text,
  -- Optional link back to a support_ticket (CSAT after resolution).
  related_ticket_id uuid REFERENCES support_tickets(id) ON DELETE SET NULL,
  status            feedback_status NOT NULL DEFAULT 'new',
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feedback_items_org_idx ON feedback_items(organization_id, created_at DESC);
CREATE INDEX feedback_items_type_idx ON feedback_items(type, created_at DESC);
CREATE INDEX feedback_items_sentiment_idx ON feedback_items(sentiment, created_at DESC);

ALTER TABLE feedback_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedback_items_admin_select ON feedback_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

CREATE POLICY feedback_items_org_select ON feedback_items
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- Anyone authenticated can submit feedback against their own org.
CREATE POLICY feedback_items_insert ON feedback_items
  FOR INSERT
  WITH CHECK (
    (submitter_user_id = auth.uid() OR submitter_user_id IS NULL)
    AND (
      organization_id IS NULL
      OR organization_id IN (
        SELECT organization_id FROM organization_memberships
        WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      )
    )
  );

-- ──────────────────────────────────────────────────────────────────────
-- churn_signals
-- ──────────────────────────────────────────────────────────────────────

CREATE TYPE churn_signal_type AS ENUM (
  'no_login_30d', 'tier_downgrade', 'payment_failed', 'negative_feedback',
  'support_burst', 'usage_collapse'
);

CREATE TYPE churn_signal_status AS ENUM (
  'open', 'acknowledged', 'resolved', 'churned'
);

CREATE TABLE churn_signals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  signal_type     churn_signal_type NOT NULL,
  severity        ops_severity NOT NULL DEFAULT 'P2',
  status          churn_signal_status NOT NULL DEFAULT 'open',
  summary         text NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX churn_signals_org_idx ON churn_signals(organization_id, status, detected_at DESC);
CREATE INDEX churn_signals_type_idx ON churn_signals(signal_type, status);

-- One open signal per (org, type) — re-detection updates the existing row.
CREATE UNIQUE INDEX churn_signals_unique_open_idx
  ON churn_signals(organization_id, signal_type)
  WHERE status = 'open';

ALTER TABLE churn_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY churn_signals_admin_select ON churn_signals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

-- ──────────────────────────────────────────────────────────────────────
-- ops_inbox VIEW — one query, all five tables.
--
-- Common shape:
--   id, source_type, source_id, organization_id, severity, status,
--   summary, created_at, updated_at, resolved_at, metadata
--
-- source_type lives in:
--   'support_ticket' | 'error_event' | 'alert_event' | 'feedback_item' | 'churn_signal'
--
-- The view is queried by lib/ops/spine.ts. RLS on the underlying tables
-- enforces visibility — admins see everything, org members see their own.
-- ──────────────────────────────────────────────────────────────────────

CREATE VIEW ops_inbox AS
  SELECT
    id,
    'support_ticket'::text                       AS source_type,
    id::text                                     AS source_id,
    organization_id,
    severity::text                               AS severity,
    status::text                                 AS status,
    coalesce(subject, ticket_number)             AS summary,
    created_at,
    updated_at,
    resolved_at,
    jsonb_build_object(
      'ticket_number', ticket_number,
      'category',      category,
      'submitter',     submitter_email,
      'tags',          tags
    )                                            AS metadata
  FROM support_tickets
  WHERE deleted_at IS NULL

  UNION ALL

  SELECT
    id,
    'error_event'::text                          AS source_type,
    id::text                                     AS source_id,
    organization_id,
    severity::text                               AS severity,
    status::text                                 AS status,
    left(coalesce(message, '(no message)'), 240) AS summary,
    created_at,
    last_seen_at                                 AS updated_at,
    resolved_at,
    jsonb_build_object(
      'origin',           origin,
      'stack_hash',       stack_hash,
      'route',            route,
      'persona',          persona,
      'occurrence_count', occurrence_count,
      'last_seen_at',     last_seen_at
    )                                            AS metadata
  FROM error_events

  UNION ALL

  SELECT
    id,
    'alert_event'::text                          AS source_type,
    id::text                                     AS source_id,
    organization_id,
    severity::text                               AS severity,
    status::text                                 AS status,
    summary                                      AS summary,
    created_at,
    updated_at,
    resolved_at,
    jsonb_build_object(
      'alert_type',     alert_type,
      'fired_at',       fired_at,
      'acknowledged_at', acknowledged_at
    ) || metadata                                AS metadata
  FROM alert_events

  UNION ALL

  SELECT
    id,
    'feedback_item'::text                        AS source_type,
    id::text                                     AS source_id,
    organization_id,
    -- Synthetic severity from sentiment so feedback fits the spine shape.
    CASE
      WHEN sentiment = 'negative' THEN 'P2'
      WHEN sentiment = 'positive' THEN 'P3'
      ELSE 'P3'
    END::text                                    AS severity,
    status::text                                 AS status,
    left(coalesce(body, '(' || type::text || ')'), 240) AS summary,
    created_at,
    created_at                                   AS updated_at,
    NULL::timestamptz                            AS resolved_at,
    jsonb_build_object(
      'type',      type,
      'score',     score,
      'sentiment', sentiment,
      'page',      source_page
    )                                            AS metadata
  FROM feedback_items

  UNION ALL

  SELECT
    id,
    'churn_signal'::text                         AS source_type,
    id::text                                     AS source_id,
    organization_id,
    severity::text                               AS severity,
    status::text                                 AS status,
    summary                                      AS summary,
    detected_at                                  AS created_at,
    detected_at                                  AS updated_at,
    resolved_at,
    jsonb_build_object(
      'signal_type', signal_type,
      'detected_at', detected_at
    ) || metadata                                AS metadata
  FROM churn_signals;

-- View is admin-readable through the underlying tables' RLS.
-- Granting select so the service role and admin queries work.
GRANT SELECT ON ops_inbox TO authenticated, service_role;

COMMENT ON VIEW ops_inbox IS
  'Phase 16 unified ops spine. Five entity types with shared shape — see lib/ops/spine.ts.';
