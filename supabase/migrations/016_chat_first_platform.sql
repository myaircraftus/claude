-- Migration 016: Chat-First Aviation Maintenance OS
-- Adds customers, conversation threads, work orders, logbook entries,
-- invoices, payments, signatures, audit events, parts searches, and share links.

-- ============================================================
-- 1. CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  company                  TEXT,
  email                    TEXT,
  phone                    TEXT,
  billing_address          JSONB,
  notes                    TEXT,
  preferred_communication  TEXT NOT NULL DEFAULT 'email',
  tags                     TEXT[],
  portal_access            BOOLEAN NOT NULL DEFAULT false,
  portal_token             UUID NOT NULL DEFAULT uuid_generate_v4(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_org ON customers(organization_id);
CREATE INDEX idx_customers_email ON customers(organization_id, email);
CREATE INDEX idx_customers_portal_token ON customers(portal_token);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select" ON customers FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "customers_insert" ON customers FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "customers_update" ON customers FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "customers_delete" ON customers FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- ============================================================
-- 2. CONVERSATION THREADS
-- ============================================================
CREATE TABLE conversation_threads (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  title            TEXT NOT NULL DEFAULT 'New conversation',
  pinned           BOOLEAN NOT NULL DEFAULT false,
  archived         BOOLEAN NOT NULL DEFAULT false,
  aircraft_id      UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
  thread_type      TEXT NOT NULL DEFAULT 'general'
                   CHECK (thread_type IN ('general','maintenance','billing','parts','inspection')),
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_threads_org ON conversation_threads(organization_id);
CREATE INDEX idx_threads_aircraft ON conversation_threads(aircraft_id) WHERE aircraft_id IS NOT NULL;
CREATE INDEX idx_threads_customer ON conversation_threads(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_threads_created_by ON conversation_threads(created_by);
CREATE INDEX idx_threads_org_created_at ON conversation_threads(organization_id, created_at DESC);
CREATE INDEX idx_threads_pinned ON conversation_threads(organization_id, pinned) WHERE pinned = true;

ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "threads_select" ON conversation_threads FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "threads_insert" ON conversation_threads FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "threads_update" ON conversation_threads FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "threads_delete" ON conversation_threads FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- ============================================================
-- 3. THREAD MESSAGES
-- ============================================================
CREATE TABLE thread_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id       UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  intent          TEXT,   -- 'logbook_entry','work_order','invoice','parts_lookup','query','action'
  artifact_type   TEXT,   -- type of artifact generated
  artifact_id     UUID,   -- reference to generated artifact (type-agnostic, nullable)
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_thread_messages_thread ON thread_messages(thread_id, created_at);
CREATE INDEX idx_thread_messages_org ON thread_messages(organization_id);
CREATE INDEX idx_thread_messages_artifact ON thread_messages(artifact_type, artifact_id)
  WHERE artifact_id IS NOT NULL;

ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_messages_select" ON thread_messages FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "thread_messages_insert" ON thread_messages FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "thread_messages_update" ON thread_messages FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));

-- ============================================================
-- 4. THREAD LINKS
-- ============================================================
CREATE TABLE thread_links (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id       UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  object_type     TEXT NOT NULL,  -- 'aircraft','customer','work_order','invoice','logbook_entry','document'
  object_id       UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_thread_links_thread ON thread_links(thread_id);
CREATE INDEX idx_thread_links_object ON thread_links(object_type, object_id);
CREATE INDEX idx_thread_links_org ON thread_links(organization_id);
CREATE UNIQUE INDEX idx_thread_links_unique ON thread_links(thread_id, object_type, object_id);

ALTER TABLE thread_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_links_select" ON thread_links FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "thread_links_insert" ON thread_links FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "thread_links_delete" ON thread_links FOR DELETE
  USING (organization_id = ANY(get_my_org_ids()));

-- ============================================================
-- 5. WORK ORDERS
-- ============================================================
CREATE TABLE work_orders (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_number         TEXT NOT NULL,
  aircraft_id               UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  customer_id               UUID REFERENCES customers(id) ON DELETE SET NULL,
  thread_id                 UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  assigned_mechanic_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status                    TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN (
                              'draft','open','awaiting_approval','awaiting_parts','in_progress',
                              'waiting_on_customer','ready_for_signoff','closed',
                              'invoiced','paid','archived'
                            )),
  complaint                 TEXT,
  discrepancy               TEXT,
  troubleshooting_notes     TEXT,
  findings                  TEXT,
  corrective_action         TEXT,
  labor_total               NUMERIC(10,2) NOT NULL DEFAULT 0,
  parts_total               NUMERIC(10,2) NOT NULL DEFAULT 0,
  outside_services_total    NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount                NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount              NUMERIC(10,2) NOT NULL DEFAULT 0,
  internal_notes            TEXT,
  customer_visible_notes    TEXT,
  opened_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at                 TIMESTAMPTZ,
  invoiced_at               TIMESTAMPTZ,
  linked_invoice_id         UUID,   -- FK to invoices added after invoices table is created
  linked_logbook_entry_id   UUID,   -- FK to logbook_entries added after that table is created
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, work_order_number)
);

CREATE INDEX idx_work_orders_org ON work_orders(organization_id);
CREATE INDEX idx_work_orders_aircraft ON work_orders(aircraft_id) WHERE aircraft_id IS NOT NULL;
CREATE INDEX idx_work_orders_customer ON work_orders(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_work_orders_status ON work_orders(organization_id, status);
CREATE INDEX idx_work_orders_created_at ON work_orders(organization_id, created_at DESC);
CREATE INDEX idx_work_orders_mechanic ON work_orders(assigned_mechanic_id) WHERE assigned_mechanic_id IS NOT NULL;

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_orders_select" ON work_orders FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "work_orders_insert" ON work_orders FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "work_orders_update" ON work_orders FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "work_orders_delete" ON work_orders FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- ============================================================
-- 6. WORK ORDER LINES
-- ============================================================
CREATE TABLE work_order_lines (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id          UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  line_type              TEXT NOT NULL
                         CHECK (line_type IN ('labor','part','outside_service','discrepancy','note')),
  description            TEXT NOT NULL,
  quantity               NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price             NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total             NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  part_number            TEXT,
  serial_number_removed  TEXT,
  serial_number_installed TEXT,
  vendor                 TEXT,
  condition              TEXT CHECK (condition IN ('new','overhauled','serviceable','used')),
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','ordered','received','installed','n/a')),
  mechanic_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  hours                  NUMERIC(6,2),    -- for labor lines
  rate                   NUMERIC(10,2),   -- hourly rate for labor
  notes                  TEXT,
  sort_order             INT NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wo_lines_work_order ON work_order_lines(work_order_id);
CREATE INDEX idx_wo_lines_org ON work_order_lines(organization_id);
CREATE INDEX idx_wo_lines_part_number ON work_order_lines(part_number) WHERE part_number IS NOT NULL;

ALTER TABLE work_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wo_lines_select" ON work_order_lines FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "wo_lines_insert" ON work_order_lines FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "wo_lines_update" ON work_order_lines FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "wo_lines_delete" ON work_order_lines FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

-- ============================================================
-- 7. LOGBOOK ENTRIES
-- (maintenance_entry_drafts FK is advisory — table may not exist yet)
-- ============================================================
CREATE TABLE logbook_entries (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id              UUID NOT NULL REFERENCES aircraft(id) ON DELETE RESTRICT,
  work_order_id            UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  thread_id                UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  draft_id                 UUID,   -- FK to maintenance_entry_drafts if that table exists
  entry_type               TEXT NOT NULL DEFAULT 'maintenance'
                           CHECK (entry_type IN (
                             'maintenance','annual','100hr','discrepancy','ad_compliance',
                             'sb_compliance','component_replacement','oil_change',
                             'return_to_service','major_repair','major_alteration','owner_preventive'
                           )),
  entry_date               DATE NOT NULL,
  hobbs_in                 NUMERIC(8,1),
  hobbs_out                NUMERIC(8,1),
  tach_time                NUMERIC(8,1),
  total_time               NUMERIC(8,1),
  description              TEXT NOT NULL,
  parts_used               JSONB NOT NULL DEFAULT '[]',
  references_used          JSONB NOT NULL DEFAULT '[]',
  ad_numbers               TEXT[],
  work_order_ref           TEXT,
  status                   TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','final','signed','amended')),
  signed_at                TIMESTAMPTZ,
  signed_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signature_certificate_id UUID,   -- FK to signature_certificates added after that table is created
  amendment_of             UUID REFERENCES logbook_entries(id) ON DELETE SET NULL,
  amendment_reason         TEXT,
  version                  INT NOT NULL DEFAULT 1,
  created_by               UUID NOT NULL REFERENCES auth.users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_logbook_entries_org ON logbook_entries(organization_id);
CREATE INDEX idx_logbook_entries_aircraft ON logbook_entries(aircraft_id);
CREATE INDEX idx_logbook_entries_entry_date ON logbook_entries(organization_id, entry_date DESC);
CREATE INDEX idx_logbook_entries_status ON logbook_entries(organization_id, status);
CREATE INDEX idx_logbook_entries_work_order ON logbook_entries(work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX idx_logbook_entries_amendment_of ON logbook_entries(amendment_of) WHERE amendment_of IS NOT NULL;

ALTER TABLE logbook_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logbook_select" ON logbook_entries FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "logbook_insert" ON logbook_entries FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "logbook_update" ON logbook_entries FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "logbook_delete" ON logbook_entries FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- ============================================================
-- 8. SIGNATURE CERTIFICATES (immutable — no UPDATE/DELETE)
-- ============================================================
CREATE TABLE signature_certificates (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_type            TEXT NOT NULL,  -- 'logbook_entry','work_order','invoice','custom'
  document_id              UUID NOT NULL,
  document_hash            TEXT NOT NULL,  -- SHA-256 of document content at signing time
  document_version         INT NOT NULL DEFAULT 1,
  signer_id                UUID NOT NULL REFERENCES auth.users(id),
  signer_name              TEXT NOT NULL,
  signer_certificate_number TEXT,          -- A&P/IA cert number
  signer_role              TEXT,           -- 'A&P','IA','owner','admin'
  signature_data           TEXT NOT NULL,  -- base64 SVG path or typed signature
  signature_type           TEXT NOT NULL DEFAULT 'drawn' CHECK (signature_type IN ('drawn','typed')),
  consent_statement        TEXT NOT NULL,
  consent_accepted_at      TIMESTAMPTZ NOT NULL,
  signed_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timezone                 TEXT NOT NULL DEFAULT 'UTC',
  ip_address               TEXT,
  session_id               TEXT,
  device_metadata          JSONB NOT NULL DEFAULT '{}',
  location_data            JSONB,          -- opt-in only
  verification_token       UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  verification_url         TEXT,
  revoked_at               TIMESTAMPTZ,
  revoked_reason           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sig_certs_org ON signature_certificates(organization_id);
CREATE INDEX idx_sig_certs_document ON signature_certificates(document_type, document_id);
CREATE INDEX idx_sig_certs_signer ON signature_certificates(signer_id);
CREATE INDEX idx_sig_certs_verification_token ON signature_certificates(verification_token);

ALTER TABLE signature_certificates ENABLE ROW LEVEL SECURITY;

-- Immutable: SELECT and INSERT only
CREATE POLICY "sig_certs_select" ON signature_certificates FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "sig_certs_insert" ON signature_certificates FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

-- ============================================================
-- 9. INVOICES
-- ============================================================
CREATE TABLE invoices (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_number   TEXT NOT NULL,
  customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
  aircraft_id      UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  work_order_id    UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  thread_id        UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN (
                     'draft','sent','pending','partially_paid','paid',
                     'overdue','void','writeoff'
                   )),
  issue_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE,
  subtotal         NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_rate         NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total            NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid      NUMERIC(10,2) NOT NULL DEFAULT 0,
  balance_due      NUMERIC(10,2) GENERATED ALWAYS AS (total - amount_paid) STORED,
  notes            TEXT,
  internal_notes   TEXT,
  payment_terms    TEXT NOT NULL DEFAULT 'Net 30',
  sent_at          TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  voided_at        TIMESTAMPTZ,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, invoice_number)
);

CREATE INDEX idx_invoices_org ON invoices(organization_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_invoices_status ON invoices(organization_id, status);
CREATE INDEX idx_invoices_due_date ON invoices(organization_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_invoices_work_order ON invoices(work_order_id) WHERE work_order_id IS NOT NULL;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select" ON invoices FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "invoices_insert" ON invoices FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "invoices_update" ON invoices FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "invoices_delete" ON invoices FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- ============================================================
-- 10. INVOICE LINE ITEMS
-- ============================================================
CREATE TABLE invoice_line_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id          UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  description         TEXT NOT NULL,
  quantity            NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price          NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total          NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  item_type           TEXT NOT NULL DEFAULT 'service'
                      CHECK (item_type IN ('labor','part','service','outside_service','fee')),
  work_order_line_id  UUID REFERENCES work_order_lines(id) ON DELETE SET NULL,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_lines_invoice ON invoice_line_items(invoice_id);
CREATE INDEX idx_invoice_lines_org ON invoice_line_items(organization_id);
CREATE INDEX idx_invoice_lines_wo_line ON invoice_line_items(work_order_line_id) WHERE work_order_line_id IS NOT NULL;

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_lines_select" ON invoice_line_items FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "invoice_lines_insert" ON invoice_line_items FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "invoice_lines_update" ON invoice_line_items FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "invoice_lines_delete" ON invoice_line_items FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));

-- ============================================================
-- 11. PAYMENTS
-- ============================================================
CREATE TABLE payments (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id       UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount           NUMERIC(10,2) NOT NULL,
  payment_method   TEXT CHECK (payment_method IN ('cash','check','credit_card','wire','ach','other')),
  reference_number TEXT,
  notes            TEXT,
  recorded_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_org ON payments(organization_id);
CREATE INDEX idx_payments_payment_date ON payments(organization_id, payment_date DESC);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select" ON payments FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "payments_insert" ON payments FOR INSERT
  WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'mechanic']));
CREATE POLICY "payments_update" ON payments FOR UPDATE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));
CREATE POLICY "payments_delete" ON payments FOR DELETE
  USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- ============================================================
-- 12. AUDIT EVENTS (append-only — SELECT and INSERT only)
-- ============================================================
CREATE TABLE audit_events (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name         TEXT,
  event_type         TEXT NOT NULL
                     CHECK (event_type IN (
                       'create','update','delete','sign','export','email',
                       'share','view','payment','status_change'
                     )),
  object_type        TEXT NOT NULL,
  object_id          UUID NOT NULL,
  object_description TEXT,
  field_changes      JSONB,   -- {field: {old: val, new: val}}
  metadata           JSONB NOT NULL DEFAULT '{}',
  ip_address         TEXT,
  user_agent         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_events_org ON audit_events(organization_id);
CREATE INDEX idx_audit_events_object ON audit_events(object_type, object_id);
CREATE INDEX idx_audit_events_created_at ON audit_events(organization_id, created_at DESC);
CREATE INDEX idx_audit_events_actor ON audit_events(actor_id) WHERE actor_id IS NOT NULL;

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Append-only: SELECT (admins/auditors) and INSERT (all org members)
CREATE POLICY "audit_events_select" ON audit_events FOR SELECT
  USING (
    organization_id = ANY(get_my_org_ids())
    AND has_org_role(organization_id, ARRAY['owner', 'admin', 'auditor'])
  );
CREATE POLICY "audit_events_insert" ON audit_events FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

-- ============================================================
-- 13. PARTS SEARCHES
-- ============================================================
CREATE TABLE parts_searches (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id             UUID REFERENCES conversation_threads(id) ON DELETE SET NULL,
  aircraft_id           UUID REFERENCES aircraft(id) ON DELETE SET NULL,
  work_order_id         UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  query                 TEXT NOT NULL,
  results               JSONB NOT NULL DEFAULT '[]',
  selected_result       JSONB,
  added_to_work_order   BOOLEAN NOT NULL DEFAULT false,
  created_by            UUID NOT NULL REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parts_searches_org ON parts_searches(organization_id);
CREATE INDEX idx_parts_searches_thread ON parts_searches(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX idx_parts_searches_work_order ON parts_searches(work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX idx_parts_searches_created_by ON parts_searches(created_by);

ALTER TABLE parts_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parts_searches_select" ON parts_searches FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "parts_searches_insert" ON parts_searches FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "parts_searches_update" ON parts_searches FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));

-- ============================================================
-- 14. SHARE LINKS
-- ============================================================
CREATE TABLE share_links (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_type     TEXT NOT NULL,
  object_id       UUID NOT NULL,
  token           UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  expires_at      TIMESTAMPTZ,
  view_count      INT NOT NULL DEFAULT 0,
  last_viewed_at  TIMESTAMPTZ,
  password_hash   TEXT,
  permissions     JSONB NOT NULL DEFAULT '{"view": true, "download": false}',
  revoked         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_share_links_org ON share_links(organization_id);
CREATE INDEX idx_share_links_object ON share_links(object_type, object_id);
CREATE INDEX idx_share_links_token ON share_links(token);

ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "share_links_select" ON share_links FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "share_links_insert" ON share_links FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "share_links_update" ON share_links FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "share_links_delete" ON share_links FOR DELETE
  USING (organization_id = ANY(get_my_org_ids()));

-- ============================================================
-- DEFERRED FOREIGN KEY CONSTRAINTS
-- (added now that both referencing and referenced tables exist)
-- ============================================================

-- work_orders.linked_invoice_id -> invoices
ALTER TABLE work_orders
  ADD CONSTRAINT fk_work_order_invoice
  FOREIGN KEY (linked_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

-- work_orders.linked_logbook_entry_id -> logbook_entries
ALTER TABLE work_orders
  ADD CONSTRAINT fk_work_order_logbook_entry
  FOREIGN KEY (linked_logbook_entry_id) REFERENCES logbook_entries(id) ON DELETE SET NULL;

-- logbook_entries.signature_certificate_id -> signature_certificates
ALTER TABLE logbook_entries
  ADD CONSTRAINT fk_logbook_signature
  FOREIGN KEY (signature_certificate_id) REFERENCES signature_certificates(id) ON DELETE SET NULL;

-- ============================================================
-- AUTO-INCREMENT NUMBER GENERATORS
-- ============================================================

CREATE OR REPLACE FUNCTION generate_work_order_number(org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num  INT;
  year_str  TEXT := to_char(NOW(), 'YYYY');
BEGIN
  SELECT COALESCE(
    MAX(SUBSTRING(work_order_number FROM '\d+$')::INT), 0
  ) + 1
  INTO next_num
  FROM work_orders
  WHERE organization_id = org_id
    AND work_order_number LIKE 'WO-' || year_str || '-%';

  RETURN 'WO-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION generate_invoice_number(org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num  INT;
  year_str  TEXT := to_char(NOW(), 'YYYY');
BEGIN
  SELECT COALESCE(
    MAX(SUBSTRING(invoice_number FROM '\d+$')::INT), 0
  ) + 1
  INTO next_num
  FROM invoices
  WHERE organization_id = org_id
    AND invoice_number LIKE 'INV-' || year_str || '-%';

  RETURN 'INV-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_conversation_threads_updated_at
  BEFORE UPDATE ON conversation_threads
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_work_orders_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_logbook_entries_updated_at
  BEFORE UPDATE ON logbook_entries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
