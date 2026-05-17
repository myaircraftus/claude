-- Expiration tracking tables for the Expirations module.
--
-- The Tools/calibration, Scheduler, Time Clock and Time Off surfaces all
-- reuse existing tables (tools, calibration_events, shifts, clock_events,
-- time_off_requests). Only two surfaces need new storage:
--
--   * mechanic_certificates — A&P / IA / Repairman / FCC credentials per
--     mechanic, for /expirations/licenses.
--   * document_expirations  — expiring aircraft/shop documents and the
--     owner personal lockbox, for /expirations/documents and
--     /expirations/owner-documents.
--
-- Re-runnable. org-membership RLS via get_my_org_ids() (same pattern as the
-- taxonomy + workforce tables); updated_at via the shared touch_updated_at().

-- ── Mechanic licenses & certificates ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS mechanic_certificates (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mechanic_name      TEXT,
  certificate_type   TEXT NOT NULL,
  certificate_number TEXT,
  issuing_authority  TEXT,
  issue_date         DATE,
  expiration_date    DATE,
  renewal_reminder   BOOLEAN NOT NULL DEFAULT TRUE,
  notes              TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mechanic_certificates_org ON mechanic_certificates(organization_id);
CREATE INDEX IF NOT EXISTS idx_mechanic_certificates_user ON mechanic_certificates(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_mechanic_certificates_expiry ON mechanic_certificates(organization_id, expiration_date);

DROP TRIGGER IF EXISTS trg_mechanic_certificates_updated_at ON mechanic_certificates;
CREATE TRIGGER trg_mechanic_certificates_updated_at
  BEFORE UPDATE ON mechanic_certificates
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE mechanic_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mechanic_certificates_read ON mechanic_certificates;
CREATE POLICY mechanic_certificates_read ON mechanic_certificates
  FOR SELECT USING (organization_id = ANY(get_my_org_ids()));

DROP POLICY IF EXISTS mechanic_certificates_write ON mechanic_certificates;
CREATE POLICY mechanic_certificates_write ON mechanic_certificates
  FOR ALL
  USING (organization_id = ANY(get_my_org_ids()))
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON mechanic_certificates TO authenticated;

COMMENT ON TABLE mechanic_certificates IS 'Mechanic licenses/certificates (A&P, IA, Repairman, FCC) tracked for expiration.';

-- ── Document expirations (aircraft / shop docs + owner lockbox) ────────────
CREATE TABLE IF NOT EXISTS document_expirations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope            TEXT NOT NULL DEFAULT 'aircraft'
                   CHECK (scope IN ('aircraft', 'shop', 'owner')),
  aircraft_id      UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  owner_user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  document_name    TEXT NOT NULL,
  document_type    TEXT,
  document_number  TEXT,
  issuing_authority TEXT,
  issue_date       DATE,
  expiration_date  DATE,
  file_url         TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_expirations_org ON document_expirations(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_expirations_aircraft ON document_expirations(organization_id, aircraft_id);
CREATE INDEX IF NOT EXISTS idx_document_expirations_owner ON document_expirations(organization_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_document_expirations_expiry ON document_expirations(organization_id, expiration_date);

DROP TRIGGER IF EXISTS trg_document_expirations_updated_at ON document_expirations;
CREATE TRIGGER trg_document_expirations_updated_at
  BEFORE UPDATE ON document_expirations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE document_expirations ENABLE ROW LEVEL SECURITY;

-- Shop/aircraft docs are visible to every org member; owner-lockbox rows are
-- private to the owner who created them.
DROP POLICY IF EXISTS document_expirations_read ON document_expirations;
CREATE POLICY document_expirations_read ON document_expirations
  FOR SELECT USING (
    organization_id = ANY(get_my_org_ids())
    AND (scope <> 'owner' OR owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS document_expirations_write ON document_expirations;
CREATE POLICY document_expirations_write ON document_expirations
  FOR ALL
  USING (organization_id = ANY(get_my_org_ids()))
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON document_expirations TO authenticated;

COMMENT ON TABLE document_expirations IS 'Expiring aircraft/shop documents and the owner personal-document lockbox.';
