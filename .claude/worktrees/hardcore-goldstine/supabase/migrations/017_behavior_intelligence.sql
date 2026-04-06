-- user_behavior_profiles: stores what each user prefers/uses most
CREATE TABLE IF NOT EXISTS user_behavior_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  primary_role text,
  secondary_roles text[] DEFAULT '{}',
  top_aircraft_ids uuid[] DEFAULT '{}',
  top_document_types text[] DEFAULT '{}',
  top_query_categories text[] DEFAULT '{}',
  top_actions text[] DEFAULT '{}',
  last_active_context jsonb DEFAULT '{}',
  preference_weights jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- user_aircraft_access: granular per-user per-aircraft permissions
CREATE TABLE IF NOT EXISTS user_aircraft_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  aircraft_id uuid NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  access_role text NOT NULL DEFAULT 'viewer',
  can_view boolean DEFAULT true,
  can_draft_entries boolean DEFAULT false,
  can_sign_standard_entries boolean DEFAULT false,
  can_sign_inspection_entries boolean DEFAULT false,
  can_manage_documents boolean DEFAULT false,
  can_share boolean DEFAULT false,
  can_export boolean DEFAULT true,
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, aircraft_id)
);

-- role_permission_matrix: defines what each role can do with each entry type
CREATE TABLE IF NOT EXISTS role_permission_matrix (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  role text NOT NULL,
  entry_type text NOT NULL,
  can_generate boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  can_sign boolean DEFAULT false,
  can_finalize boolean DEFAULT false,
  requires_license_number boolean DEFAULT false,
  requires_supervisor_review boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role, entry_type)
);

-- behavior_events: tracks what users do for personalization
CREATE TABLE IF NOT EXISTS behavior_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id uuid REFERENCES aircraft(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_payload jsonb DEFAULT '{}',
  session_id text,
  created_at timestamptz DEFAULT now()
);

-- retrieval_feedback: tracks search/answer quality for ranking improvements
CREATE TABLE IF NOT EXISTS retrieval_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  aircraft_id uuid REFERENCES aircraft(id) ON DELETE SET NULL,
  query text NOT NULL,
  retrieved_doc_ids text[] DEFAULT '{}',
  clicked_doc_ids text[] DEFAULT '{}',
  final_answer_source text,
  user_correction text,
  accepted_result boolean,
  response_time_ms integer,
  created_at timestamptz DEFAULT now()
);

-- Seed default role_permission_matrix entries
INSERT INTO role_permission_matrix (role, entry_type, can_generate, can_edit, can_sign, can_finalize, requires_license_number, requires_supervisor_review) VALUES
  ('owner', 'standard_maintenance', true, true, false, true, false, false),
  ('owner', 'annual_inspection', true, true, false, false, false, true),
  ('mechanic_ap', 'standard_maintenance', true, true, true, true, true, false),
  ('mechanic_ap', 'annual_inspection', true, true, false, false, false, true),
  ('mechanic_ia', 'standard_maintenance', true, true, true, true, true, false),
  ('mechanic_ia', 'annual_inspection', true, true, true, true, true, false),
  ('mechanic_ia', 'return_to_service', true, true, true, true, true, false),
  ('ojt', 'standard_maintenance', true, true, false, false, false, true),
  ('ojt', 'annual_inspection', true, false, false, false, false, true),
  ('viewer', 'standard_maintenance', false, false, false, false, false, false),
  ('viewer', 'annual_inspection', false, false, false, false, false, false)
ON CONFLICT (role, entry_type) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_behavior_events_user_id ON behavior_events(user_id);
CREATE INDEX IF NOT EXISTS idx_behavior_events_created_at ON behavior_events(created_at);
CREATE INDEX IF NOT EXISTS idx_behavior_events_event_type ON behavior_events(event_type);
CREATE INDEX IF NOT EXISTS idx_user_aircraft_access_user_id ON user_aircraft_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_aircraft_access_aircraft_id ON user_aircraft_access(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_user_id ON retrieval_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_profiles_user_id ON user_behavior_profiles(user_id);

-- RLS policies
ALTER TABLE user_behavior_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_aircraft_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavior_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE retrieval_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own behavior profile" ON user_behavior_profiles
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own aircraft access" ON user_aircraft_access
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own behavior events" ON behavior_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own behavior events" ON behavior_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own retrieval feedback" ON retrieval_feedback
  FOR ALL USING (auth.uid() = user_id);
