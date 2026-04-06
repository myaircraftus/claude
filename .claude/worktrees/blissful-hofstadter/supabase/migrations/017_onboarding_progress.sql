-- 017_onboarding_progress.sql
-- Track onboarding completion and first-time tutorial state

CREATE TABLE IF NOT EXISTS onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  founder_note_seen BOOLEAN DEFAULT false,
  tour_completed BOOLEAN DEFAULT false,
  tour_step INT DEFAULT 0,
  onboarding_completed BOOLEAN DEFAULT false,
  steps_completed TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_progress" ON onboarding_progress FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_onboarding_user ON onboarding_progress(user_id);
