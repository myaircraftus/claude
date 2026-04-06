-- 016_chat_first_platform.sql
-- Chat-first platform: conversations, work orders, logbook entries, customers, invoices, signatures

-- ─── Customers ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  billing_address TEXT,
  notes TEXT,
  preferred_contact TEXT CHECK (preferred_contact IN ('email', 'phone', 'text')),
  portal_access BOOLEAN DEFAULT false,
  portal_token TEXT UNIQUE,
  tags TEXT[],
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Conversation Threads ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT,
  thread_type TEXT DEFAULT 'general' CHECK (thread_type IN ('general', 'maintenance', 'billing', 'parts', 'inspection', 'research')),
  aircraft_id UUID REFERENCES aircraft(id),
  customer_id UUID REFERENCES customers(id),
  is_pinned BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  message_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Thread Messages ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS thread_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  intent_type TEXT,
  artifact_type TEXT,
  artifact_data JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Work Orders ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_number TEXT NOT NULL,
  aircraft_id UUID REFERENCES aircraft(id),
  customer_id UUID REFERENCES customers(id),
  thread_id UUID REFERENCES conversation_threads(id),
  assigned_mechanic_id UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft','open','awaiting_approval','awaiting_parts','in_progress',
    'waiting_on_customer','ready_for_signoff','closed','invoiced','paid','archived'
  )),
  customer_complaint TEXT,
  squawk TEXT,
  discrepancy TEXT,
  troubleshooting_notes TEXT,
  findings TEXT,
  corrective_action TEXT,
  manual_references TEXT[],
  labor_total NUMERIC(10,2) DEFAULT 0,
  parts_total NUMERIC(10,2) DEFAULT 0,
  outside_services_total NUMERIC(10,2) DEFAULT 0,
  subtotal NUMERIC(10,2) DEFAULT 0,
  tax_amount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  internal_notes TEXT,
  customer_notes TEXT,
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, work_order_number)
);

-- ─── Work Order Lines ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL CHECK (line_type IN ('labor','part','outside_service','discrepancy','note')),
  sort_order INT DEFAULT 0,
  description TEXT,
  hours NUMERIC(6,2),
  rate NUMERIC(8,2),
  part_number TEXT,
  part_description TEXT,
  manufacturer TEXT,
  serial_number_removed TEXT,
  serial_number_installed TEXT,
  quantity INT DEFAULT 1,
  unit_price NUMERIC(10,2),
  condition TEXT CHECK (condition IN ('new','overhauled','serviceable','repaired')),
  vendor TEXT,
  line_total NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','ordered','received','installed','complete')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Logbook Entries ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logbook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID REFERENCES aircraft(id),
  work_order_id UUID REFERENCES work_orders(id),
  thread_id UUID REFERENCES conversation_threads(id),
  entry_type TEXT DEFAULT 'maintenance' CHECK (entry_type IN (
    'maintenance','inspection','annual','100hr','preventive',
    'ad_compliance','sb_compliance','component_replacement','alteration',
    'major_repair','return_to_service','discrepancy','oil_change','custom'
  )),
  logbook_type TEXT DEFAULT 'airframe' CHECK (logbook_type IN ('airframe','engine','prop','avionics')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','final','signed','amended')),
  entry_date DATE,
  hobbs_time NUMERIC(8,1),
  tach_time NUMERIC(8,1),
  total_time_after NUMERIC(8,1),
  entry_text TEXT,
  customer_summary TEXT,
  parts_used JSONB DEFAULT '[]',
  ad_references TEXT[],
  sb_references TEXT[],
  manual_references TEXT[],
  mechanic_name TEXT,
  mechanic_certificate TEXT,
  mechanic_cert_number TEXT,
  ia_name TEXT,
  ia_cert_number TEXT,
  return_to_service BOOLEAN DEFAULT false,
  version_number INT DEFAULT 1,
  supersedes_id UUID REFERENCES logbook_entries(id),
  amended_reason TEXT,
  ai_generated BOOLEAN DEFAULT false,
  ai_model TEXT,
  missing_fields TEXT[],
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Invoices ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  aircraft_id UUID REFERENCES aircraft(id),
  work_order_id UUID REFERENCES work_orders(id),
  thread_id UUID REFERENCES conversation_threads(id),
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft','sent','pending','partially_paid','paid','overdue','void','bad_debt'
  )),
  subtotal NUMERIC(10,2) DEFAULT 0,
  tax_rate NUMERIC(5,4) DEFAULT 0,
  tax_amount NUMERIC(10,2) DEFAULT 0,
  shipping NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  amount_paid NUMERIC(10,2) DEFAULT 0,
  balance_due NUMERIC(10,2) DEFAULT 0,
  invoice_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  internal_notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, invoice_number)
);

-- ─── Invoice Line Items ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(8,2) DEFAULT 1,
  unit_price NUMERIC(10,2) DEFAULT 0,
  line_total NUMERIC(10,2) DEFAULT 0,
  line_type TEXT DEFAULT 'service' CHECK (line_type IN ('labor','part','service','outside_service','discount','tax','other')),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Payments ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  method TEXT CHECK (method IN ('cash','check','credit_card','wire','ach','other')),
  reference_number TEXT,
  notes TEXT,
  payment_date DATE DEFAULT CURRENT_DATE,
  recorded_by UUID REFERENCES auth.users(id),
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Digital Signatures ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digital_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  signer_id UUID NOT NULL REFERENCES auth.users(id),
  document_type TEXT NOT NULL,
  document_id UUID NOT NULL,
  document_hash TEXT NOT NULL,
  document_version INT NOT NULL DEFAULT 1,
  signer_name TEXT NOT NULL,
  signer_certificate TEXT,
  signer_cert_number TEXT,
  signer_role TEXT,
  signature_data TEXT NOT NULL,
  signature_type TEXT DEFAULT 'drawn' CHECK (signature_type IN ('drawn','typed','certificate')),
  consent_statement TEXT NOT NULL,
  consent_version TEXT DEFAULT '1.0',
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  location_lat NUMERIC(10,8),
  location_lon NUMERIC(11,8),
  location_consent BOOLEAN DEFAULT false,
  certificate_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  signed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Share Links ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  expires_at TIMESTAMPTZ,
  max_views INT,
  view_count INT DEFAULT 0,
  can_download BOOLEAN DEFAULT true,
  can_print BOOLEAN DEFAULT true,
  label TEXT,
  last_viewed_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Parts Searches ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parts_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES conversation_threads(id),
  aircraft_id UUID REFERENCES aircraft(id),
  search_query TEXT NOT NULL,
  search_type TEXT DEFAULT 'general' CHECK (search_type IN ('general','part_number','description','ipc')),
  results_count INT DEFAULT 0,
  selected_part_number TEXT,
  added_to_work_order_id UUID REFERENCES work_orders(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_threads_org ON conversation_threads(organization_id);
CREATE INDEX IF NOT EXISTS idx_threads_aircraft ON conversation_threads(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_threads_last_message ON conversation_threads(organization_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON thread_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_org ON thread_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_org ON work_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_aircraft ON work_orders(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_logbook_entries_org ON logbook_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_logbook_entries_aircraft ON logbook_entries(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_signatures_document ON digital_signatures(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);

-- ─── Work order number sequences ───────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS work_order_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 2001;

CREATE OR REPLACE FUNCTION next_work_order_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'WO-' || LPAD(nextval('work_order_seq')::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'INV-' || LPAD(nextval('invoice_number_seq')::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ─── Row-Level Security ────────────────────────────────────────────────────────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE logbook_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_customers" ON customers FOR ALL TO authenticated
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_threads" ON conversation_threads FOR ALL TO authenticated
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_messages" ON thread_messages FOR ALL TO authenticated
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_work_orders" ON work_orders FOR ALL TO authenticated
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_wo_lines" ON work_order_lines FOR ALL TO authenticated
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_logbook_entries" ON logbook_entries FOR ALL TO authenticated
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_invoices" ON invoices FOR ALL TO authenticated
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_invoice_lines" ON invoice_line_items FOR ALL TO authenticated
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_chat_payments" ON chat_payments FOR ALL TO authenticated
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_signatures" ON digital_signatures FOR ALL TO authenticated
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_share_links" ON share_links FOR ALL TO authenticated
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_parts_searches" ON parts_searches FOR ALL TO authenticated
  USING (organization_id = ANY(get_my_org_ids()));
