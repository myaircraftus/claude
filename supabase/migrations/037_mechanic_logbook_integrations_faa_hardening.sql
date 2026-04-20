ALTER TABLE aircraft_registry_snapshots
  ADD COLUMN IF NOT EXISTS registrant_city TEXT,
  ADD COLUMN IF NOT EXISTS registrant_state TEXT,
  ADD COLUMN IF NOT EXISTS registrant_zip TEXT,
  ADD COLUMN IF NOT EXISTS registrant_type TEXT,
  ADD COLUMN IF NOT EXISTS registrant_country TEXT;

ALTER TABLE integration_sync_logs
  ADD COLUMN IF NOT EXISTS summary JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS invoice_exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  provider_invoice_id TEXT,
  error_message TEXT,
  exported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (integration_id, invoice_id)
);

ALTER TABLE invoice_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_invoice_exports" ON invoice_exports FOR ALL USING (
  organization_id IN (
    SELECT organization_id
    FROM organization_memberships
    WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
  )
);
