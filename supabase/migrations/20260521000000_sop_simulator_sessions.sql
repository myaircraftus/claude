-- SOP simulator sessions
--
-- Persists every chat session a user has with the AI Simulator at
-- /sop-library/simulator. Two reasons:
--   1. Compliance evidence — when a mechanic claims they "completed the
--      annual scenario" we need a permanent record of the conversation,
--      not just an in-memory React state that vanished on tab close.
--   2. Resume — when a user closes the tab mid-scenario we want them to
--      come back and pick up where they left off.
--
-- The table is intentionally per-user, not per-organization. The
-- simulator is platform-meta (training on how the platform works),
-- not tenant data.

CREATE TABLE IF NOT EXISTS public.sop_simulator_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario_id     text NOT NULL,         -- matches SCENARIOS[].id in code
  -- Full chat history as JSONB. Append-only at the API layer.
  messages        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Cumulative list of success criteria the AI has marked completed.
  completed_criteria text[] NOT NULL DEFAULT '{}',
  -- True once the AI ends the scenario with scenarioComplete=true.
  is_complete     boolean NOT NULL DEFAULT false,
  -- For "Completion Certificate" generation. Captured server-side at the
  -- transition to is_complete=true.
  completed_at    timestamptz,
  -- Tracking — useful for analytics + investor demos ("we have run X
  -- training sessions").
  started_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  -- Optional org context — if the user is a shop staff member, we can
  -- aggregate per-org training-completion metrics for the shop owner.
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  CONSTRAINT sop_simulator_sessions_scenario_check
    CHECK (length(scenario_id) <= 64)
);

CREATE INDEX IF NOT EXISTS sop_simulator_sessions_user_started_idx
  ON public.sop_simulator_sessions (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS sop_simulator_sessions_scenario_idx
  ON public.sop_simulator_sessions (scenario_id, started_at DESC);

CREATE INDEX IF NOT EXISTS sop_simulator_sessions_org_idx
  ON public.sop_simulator_sessions (organization_id)
  WHERE organization_id IS NOT NULL;

-- RLS — every row is owned by its user_id. Read your own sessions,
-- write your own sessions. The service role bypasses RLS for the API
-- writer below, which uses an authenticated server-side client.
ALTER TABLE public.sop_simulator_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sop_simulator_sessions_owner_read
  ON public.sop_simulator_sessions;
CREATE POLICY sop_simulator_sessions_owner_read
  ON public.sop_simulator_sessions
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS sop_simulator_sessions_owner_insert
  ON public.sop_simulator_sessions;
CREATE POLICY sop_simulator_sessions_owner_insert
  ON public.sop_simulator_sessions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS sop_simulator_sessions_owner_update
  ON public.sop_simulator_sessions;
CREATE POLICY sop_simulator_sessions_owner_update
  ON public.sop_simulator_sessions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Platform admins can read everything for analytics (e.g., the SOP
-- Library admin dashboard at /sop-library/admin can show aggregate
-- training metrics). Writes still scoped to the owner.
DROP POLICY IF EXISTS sop_simulator_sessions_admin_read
  ON public.sop_simulator_sessions;
CREATE POLICY sop_simulator_sessions_admin_read
  ON public.sop_simulator_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_platform_admin = true
    )
  );

COMMENT ON TABLE public.sop_simulator_sessions IS
  'Persisted chat sessions from the SOP AI Simulator. Per-user, append-only by API. Used for resume + compliance evidence + training analytics.';
