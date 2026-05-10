-- Migration 110: Phase 16 Sprint 16.3 — ticket_replies + email_log
--
-- AI triage worker (lib/support/ai-triage.ts) writes auto-drafted
-- responses; admin override edits before send; customer replies through
-- /support/tickets/[ticketNumber]. All paths land here.
--
-- email_log queues outbound transactional emails for the future real
-- provider hand-off. Real send is deferred — see
-- docs/runbooks/email-ingestion.md.
--
-- This migration is NOT applied automatically. Andy applies via tsx-pg.

-- ──────────────────────────────────────────────────────────────────────
-- ticket_replies
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE ticket_replies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id         uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  body              text NOT NULL,
  is_from_ai        boolean NOT NULL DEFAULT false,
  is_from_admin     boolean NOT NULL DEFAULT false,
  is_from_customer  boolean NOT NULL DEFAULT false,
  /** AI confidence 0..1 — only set when is_from_ai. */
  ai_confidence     numeric(4, 3) CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  /** AI action taken (free-form: "auto_resolved", "escalated", "drafted"). */
  ai_action_taken   text,
  /** Admin user id when is_from_admin. */
  admin_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Exactly one source flag must be true.
  CONSTRAINT ticket_replies_one_source CHECK (
    (is_from_ai::int + is_from_admin::int + is_from_customer::int) = 1
  )
);

CREATE INDEX ticket_replies_ticket_idx
  ON ticket_replies(ticket_id, created_at);

CREATE INDEX ticket_replies_ai_idx
  ON ticket_replies(is_from_ai, created_at DESC) WHERE is_from_ai = true;

ALTER TABLE ticket_replies ENABLE ROW LEVEL SECURITY;

-- Visibility mirrors support_tickets RLS.
CREATE POLICY ticket_replies_admin_select ON ticket_replies
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

CREATE POLICY ticket_replies_org_select ON ticket_replies
  FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM support_tickets
       WHERE organization_id IN (
         SELECT organization_id FROM organization_memberships
          WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
       )
    )
  );

CREATE POLICY ticket_replies_submitter_select ON ticket_replies
  FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM support_tickets WHERE submitter_user_id = auth.uid()
    )
  );

-- Authenticated customer can insert is_from_customer replies on their
-- own tickets. AI / admin inserts go through service-role.
CREATE POLICY ticket_replies_customer_insert ON ticket_replies
  FOR INSERT
  WITH CHECK (
    is_from_customer = true
    AND ticket_id IN (
      SELECT id FROM support_tickets WHERE submitter_user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────────────
-- ai_response_count bump RPC
--
-- Called by lib/support/tickets.ts addTicketReply() when is_from_ai. We
-- could also do this with a trigger but the RPC keeps the increment
-- atomic + opt-in.
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION inc_support_ticket_ai_response(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.support_tickets
     SET ai_response_count = ai_response_count + 1,
         ai_first_response_at = COALESCE(ai_first_response_at, NOW()),
         updated_at = NOW()
   WHERE id = p_ticket_id;
END;
$$;

GRANT EXECUTE ON FUNCTION inc_support_ticket_ai_response(uuid) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────
-- email_log
--
-- Outbound transactional email queue. Real provider integration is
-- deferred — for v1 we record the email rows and a future job actually
-- sends them. Status starts at 'queued'; transitions:
--   queued → sending → sent
--   queued → skipped  (recipient opt-out)
--   sending → failed  (provider rejection)
-- ──────────────────────────────────────────────────────────────────────

CREATE TYPE email_log_kind AS ENUM (
  'ticket_reply',
  'ticket_resolution',
  'nps_prompt',
  'churn_reengagement',
  'system_alert',
  'other'
);

CREATE TYPE email_log_status AS ENUM (
  'queued',
  'sending',
  'sent',
  'failed',
  'skipped'
);

CREATE TABLE email_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid REFERENCES organizations(id) ON DELETE SET NULL,
  to_email          text NOT NULL,
  to_user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_email        text NOT NULL DEFAULT 'support@myaircraft.us',
  subject           text NOT NULL,
  body_text         text NOT NULL,
  body_html         text,
  kind              email_log_kind NOT NULL DEFAULT 'other',
  /** Source-of-truth ticket / reply / event id for rehydration. */
  related_ticket_id uuid REFERENCES support_tickets(id) ON DELETE SET NULL,
  related_reply_id  uuid REFERENCES ticket_replies(id) ON DELETE SET NULL,
  status            email_log_status NOT NULL DEFAULT 'queued',
  /** Provider message id once sent (filled by future provider integration). */
  provider_message_id text,
  delivery_attempted_at timestamptz,
  delivery_settled_at timestamptz,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_log_status_idx ON email_log(status, created_at);
CREATE INDEX email_log_to_email_idx ON email_log(to_email, created_at DESC);
CREATE INDEX email_log_kind_idx ON email_log(kind, created_at DESC);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_log_admin_select ON email_log
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

-- Recipient (user) can see their own emails. Useful for "show me what
-- aircraft.us has sent me" transparency in v2.
CREATE POLICY email_log_self_select ON email_log
  FOR SELECT
  USING (to_user_id = auth.uid());

-- Inserts go through service-role only.

-- ──────────────────────────────────────────────────────────────────────
-- support_tickets.suggested_response — admin-editable AI draft
--
-- The triage worker writes to this column when AI escalates without
-- auto-resolving. Admin opens the inbox, sees the draft, edits if
-- needed, clicks Send → that snapshot becomes a proper ticket_replies
-- row with is_from_admin=true and the suggested_response is cleared.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS suggested_response text,
  ADD COLUMN IF NOT EXISTS triage_classification jsonb;

COMMENT ON COLUMN support_tickets.suggested_response IS
  'AI-drafted response staged for admin review. Cleared once admin sends.';

COMMENT ON COLUMN support_tickets.triage_classification IS
  'AI tier-0 classification output: {category, severity, sentiment, suggested_tags, intent}.';
