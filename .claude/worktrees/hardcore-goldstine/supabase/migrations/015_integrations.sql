-- integrations: external service connections per org
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'flight_schedule_pro','flight_circle','myfbo','avianis','fl3xx','leon','talon'
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected', -- 'connected','disconnected','error','syncing'
  credentials_encrypted JSONB, -- store encrypted API keys/tokens
  settings JSONB DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  aircraft_count_synced INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, provider)
);

CREATE TABLE integration_sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL, -- 'aircraft','tach','flight_activity'
  status TEXT NOT NULL, -- 'started','success','error'
  records_synced INT DEFAULT 0,
  error_message TEXT,
  raw_response JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- community_library: shared manuals marketplace
CREATE TABLE community_library_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploaded_by_org_id UUID NOT NULL REFERENCES organizations(id),
  uploaded_by_user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  document_type TEXT NOT NULL, -- 'maintenance_manual','parts_catalog'
  aircraft_make TEXT,
  aircraft_model TEXT,
  aircraft_series TEXT,
  engine_make TEXT,
  revision TEXT,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  price_cents INT,
  download_count INT NOT NULL DEFAULT 0,
  file_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active','removed','pending_review'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE community_library_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES community_library_items(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES auth.users(id),
  amount_paid_cents INT,
  stripe_payment_intent_id TEXT,
  ingested_document_id UUID REFERENCES documents(id),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- maintenance_entry_drafts: AI-assisted entry drafts
CREATE TABLE maintenance_entry_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT,
  entry_type TEXT, -- 'maintenance','100hr','annual','oil_change','repair','ad_compliance','overhaul'
  logbook_type TEXT, -- 'airframe','engine','prop','avionics'
  ai_prompt TEXT,
  ai_generated_text TEXT,
  edited_text TEXT,
  structured_fields JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft','signed','finalized','exported'
  signed_by UUID REFERENCES auth.users(id),
  signed_at TIMESTAMPTZ,
  signoff_cert_number TEXT,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_entry_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_library_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_integrations" ON integrations FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
);
CREATE POLICY "org_sync_logs" ON integration_sync_logs FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
);
CREATE POLICY "org_entry_drafts" ON maintenance_entry_drafts FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
);
CREATE POLICY "community_lib_read" ON community_library_items FOR SELECT USING (is_public = true OR uploaded_by_org_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL));
CREATE POLICY "community_lib_write" ON community_library_items FOR INSERT WITH CHECK (
  uploaded_by_org_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
);
CREATE POLICY "community_purchases" ON community_library_purchases FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
);
