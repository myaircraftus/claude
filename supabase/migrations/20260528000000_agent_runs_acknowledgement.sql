-- Add acknowledged_at + acknowledged_by to agent_runs so the
-- /admin/agents UI can mark a needs_human recommendation as handled
-- without mutating the immutable audit fields (status / output /
-- recommendation stay as-is).
--
-- The topbar approval-count chip queries
--   status = 'needs_human' AND acknowledged_at IS NULL
-- and counts down as the founder triages.

ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agent_runs_needs_human_open_idx
  ON public.agent_runs (status, created_at DESC)
  WHERE status = 'needs_human' AND acknowledged_at IS NULL;

-- UPDATE policy: platform admins only. The existing SELECT policy
-- already gates read access; this matches.
DROP POLICY IF EXISTS agent_runs_admin_acknowledge ON public.agent_runs;
CREATE POLICY agent_runs_admin_acknowledge ON public.agent_runs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
       WHERE user_profiles.id = auth.uid()
         AND user_profiles.is_platform_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
       WHERE user_profiles.id = auth.uid()
         AND user_profiles.is_platform_admin = true
    )
  );
