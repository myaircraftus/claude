-- Unified inbox foundation. Every user gets a myaircraft.us email + (later)
-- a Twilio number. Inbound mail + SMS land in inbox_messages. AI agents
-- classify and link to expenses / estimates / invoices via the standard
-- agent_runs.recommendation path. Outbound mail/SMS goes back out from
-- the same in-app surface.
--
-- Applied to prod 2026-05-23.

-- 1. Per-user inbox identity
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS inbox_email text,
  ADD COLUMN IF NOT EXISTS inbox_phone text;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_inbox_email_uniq
  ON public.user_profiles (lower(inbox_email)) WHERE inbox_email IS NOT NULL;

-- 2. Org-level inbox config
CREATE TABLE IF NOT EXISTS public.organization_inbox_config (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  shop_inbox_email text,
  signature_md text,
  auto_classify boolean NOT NULL DEFAULT true,
  auto_extract_expenses boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Inbox messages — unified for email + SMS, inbound + outbound.
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('email','sms')),
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_addr text NOT NULL,
  to_addr   text NOT NULL,
  cc_addrs  text[] NOT NULL DEFAULT '{}',
  subject   text,
  body_text text,
  body_html text,
  raw jsonb,
  classified_as text CHECK (classified_as IN (
    'receipt','estimate','invoice','reminder','adhoc','spam','other'
  )),
  classify_confidence text CHECK (classify_confidence IN ('high','medium','low','refused')),
  related_expense_id    uuid,
  related_estimate_id   uuid,
  related_invoice_id    uuid,
  related_work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  thread_key text,
  read_at timestamptz,
  provider_msg_id text,
  provider_thread_id text,
  attachments jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbox_messages_user_created_idx
  ON public.inbox_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inbox_messages_org_created_idx
  ON public.inbox_messages (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inbox_messages_thread_idx
  ON public.inbox_messages (thread_key, created_at)
  WHERE thread_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_provider_uniq
  ON public.inbox_messages (provider_msg_id, source)
  WHERE provider_msg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inbox_messages_unread_idx
  ON public.inbox_messages (user_id) WHERE read_at IS NULL;

ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inbox_messages_own_select ON public.inbox_messages;
CREATE POLICY inbox_messages_own_select ON public.inbox_messages
  FOR SELECT USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND organization_id = ANY (get_my_org_ids()))
  );
DROP POLICY IF EXISTS inbox_messages_own_update ON public.inbox_messages;
CREATE POLICY inbox_messages_own_update ON public.inbox_messages
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. External-system credentials for Phase 3 browser-automation agents
CREATE TABLE IF NOT EXISTS public.external_system_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  system text NOT NULL,
  login_email text NOT NULL,
  password_encrypted bytea NOT NULL,
  password_iv bytea NOT NULL,
  last_synced_at timestamptz,
  last_error text,
  scrape_disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS external_creds_user_system_uniq
  ON public.external_system_credentials (user_id, system);
ALTER TABLE public.external_system_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_creds_own_all ON public.external_system_credentials;
CREATE POLICY external_creds_own_all ON public.external_system_credentials
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS inbox_messages_touch ON public.inbox_messages;
CREATE TRIGGER inbox_messages_touch BEFORE UPDATE ON public.inbox_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS external_creds_touch ON public.external_system_credentials;
CREATE TRIGGER external_creds_touch BEFORE UPDATE ON public.external_system_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS org_inbox_config_touch ON public.organization_inbox_config;
CREATE TRIGGER org_inbox_config_touch BEFORE UPDATE ON public.organization_inbox_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. allocate_inbox_email helper
CREATE OR REPLACE FUNCTION public.allocate_inbox_email(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_handle text;
  v_candidate text;
  v_suffix int := 0;
BEGIN
  SELECT handle INTO v_handle FROM public.user_profiles WHERE id = p_user_id;
  IF v_handle IS NULL OR length(v_handle) = 0 THEN
    v_handle := replace(left(p_user_id::text, 8), '-', '');
  END IF;
  v_handle := lower(regexp_replace(v_handle, '[^a-z0-9.-]', '', 'g'));
  IF length(v_handle) < 3 THEN
    v_handle := v_handle || replace(left(p_user_id::text, 4), '-', '');
  END IF;
  v_candidate := v_handle || '@myaircraft.us';
  WHILE EXISTS(
    SELECT 1 FROM public.user_profiles
     WHERE lower(inbox_email) = v_candidate AND id <> p_user_id
  ) LOOP
    v_suffix := v_suffix + 1;
    v_candidate := v_handle || v_suffix::text || '@myaircraft.us';
  END LOOP;
  UPDATE public.user_profiles SET inbox_email = v_candidate WHERE id = p_user_id;
  RETURN v_candidate;
END;
$$;
GRANT EXECUTE ON FUNCTION public.allocate_inbox_email(uuid) TO authenticated;
