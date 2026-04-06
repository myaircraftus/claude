-- Migration 011: Row Level Security (CRITICAL)

-- Enable RLS on all tenant tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE aircraft ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_metadata_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdrive_connections ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's accepted organization IDs
CREATE OR REPLACE FUNCTION get_my_org_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT ARRAY_AGG(organization_id)
  FROM organization_memberships
  WHERE user_id = auth.uid()
    AND accepted_at IS NOT NULL;
$$;

-- Helper: check role within org
CREATE OR REPLACE FUNCTION has_org_role(p_org_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND role = ANY(p_roles)
      AND accepted_at IS NOT NULL
  );
$$;

-- Organizations
CREATE POLICY "org_select" ON organizations FOR SELECT
  USING (id = ANY(get_my_org_ids()));
CREATE POLICY "org_insert" ON organizations FOR INSERT
  WITH CHECK (true); -- controlled at application layer (onboarding)
CREATE POLICY "org_update" ON organizations FOR UPDATE
  USING (has_org_role(id, ARRAY['owner', 'admin']));

-- User profiles
CREATE POLICY "profile_select" ON user_profiles FOR SELECT
  USING (
    id = auth.uid() OR EXISTS (
      SELECT 1 FROM organization_memberships m1
      JOIN organization_memberships m2 ON m2.organization_id = m1.organization_id
      WHERE m1.user_id = auth.uid() AND m2.user_id = user_profiles.id
    )
  );
CREATE POLICY "profile_update" ON user_profiles FOR UPDATE
  USING (id = auth.uid());
CREATE POLICY "profile_insert" ON user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Organization memberships
CREATE POLICY "membership_select" ON organization_memberships FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "membership_insert" ON organization_memberships FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin']));
CREATE POLICY "membership_update" ON organization_memberships FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));
CREATE POLICY "membership_delete" ON organization_memberships FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- Aircraft
CREATE POLICY "aircraft_select" ON aircraft FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "aircraft_insert" ON aircraft FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "aircraft_update" ON aircraft FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "aircraft_delete" ON aircraft FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- Documents
CREATE POLICY "documents_select" ON documents FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "documents_insert" ON documents FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "documents_update" ON documents FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "documents_delete" ON documents FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- Document chunks/pages/embeddings (read for all org members)
CREATE POLICY "chunks_select" ON document_chunks FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "chunks_insert" ON document_chunks FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

CREATE POLICY "embeddings_select" ON document_embeddings FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "embeddings_insert" ON document_embeddings FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

CREATE POLICY "pages_select" ON document_pages FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "pages_insert" ON document_pages FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

-- Queries
CREATE POLICY "queries_select" ON queries FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "queries_insert" ON queries FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "queries_update" ON queries FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()) AND user_id = auth.uid());

-- Citations
CREATE POLICY "citations_select" ON citations FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "citations_insert" ON citations FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

-- Maintenance events
CREATE POLICY "maintenance_select" ON maintenance_events FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "maintenance_insert" ON maintenance_events FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

-- Metadata extractions
CREATE POLICY "metadata_select" ON document_metadata_extractions FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "metadata_insert" ON document_metadata_extractions FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

-- Audit logs (read for admins+, insert for all)
CREATE POLICY "audit_select" ON audit_logs FOR SELECT
  USING (
    organization_id = ANY(get_my_org_ids()) AND
    has_org_role(organization_id, ARRAY['owner', 'admin', 'auditor'])
  );
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT
  WITH CHECK (true); -- audit logs can always be written

-- Google Drive connections (own only)
CREATE POLICY "gdrive_select" ON gdrive_connections FOR SELECT
  USING (user_id = auth.uid() AND organization_id = ANY(get_my_org_ids()));
CREATE POLICY "gdrive_insert" ON gdrive_connections FOR INSERT
  WITH CHECK (user_id = auth.uid() AND organization_id = ANY(get_my_org_ids()));
CREATE POLICY "gdrive_update" ON gdrive_connections FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "gdrive_delete" ON gdrive_connections FOR DELETE
  USING (user_id = auth.uid());

-- Trigger to auto-create user_profiles on auth.users insert
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
