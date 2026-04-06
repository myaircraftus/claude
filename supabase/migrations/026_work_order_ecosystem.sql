-- ============================================================================
-- Migration 026: Work-Order Ecosystem
-- Adds: squawks, maintenance_requests, parts_library, labor_rate_cards,
--        aircraft↔customer link, granular permissions, WO chat attachments,
--        Stripe Connect, invoice reminders, invoice email/payment tracking
-- ============================================================================

-- ─── 1. Aircraft ↔ Customer link ──────────────────────────────────────────────

ALTER TABLE aircraft ADD COLUMN IF NOT EXISTS owner_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_aircraft_owner_customer ON aircraft(owner_customer_id);

CREATE TABLE IF NOT EXISTS aircraft_customer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'owner'
    CHECK (relationship IN ('owner','operator','lessee','manager','fractional')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aircraft_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_aca_org ON aircraft_customer_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_aca_aircraft ON aircraft_customer_assignments(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_aca_customer ON aircraft_customer_assignments(customer_id);

ALTER TABLE aircraft_customer_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aca_select" ON aircraft_customer_assignments FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "aca_insert" ON aircraft_customer_assignments FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "aca_update" ON aircraft_customer_assignments FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "aca_delete" ON aircraft_customer_assignments FOR DELETE
  USING (organization_id = ANY(get_my_org_ids()));

-- ─── 2. Granular permissions on org memberships ──────────────────────────────

ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organization_memberships.permissions IS
  'Granular toggles: can_create_wo, can_see_rates, can_invoice, can_approve, can_manage_customers';

-- ─── 3. Squawks ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS squawks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  reported_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'normal'
    CHECK (severity IN ('minor','normal','urgent','grounding')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','acknowledged','in_work_order','resolved','deferred')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','voice','photo','flight_schedule_pro','mobile_app')),
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_squawks_org ON squawks(organization_id);
CREATE INDEX IF NOT EXISTS idx_squawks_aircraft ON squawks(aircraft_id);
CREATE INDEX IF NOT EXISTS idx_squawks_status ON squawks(status);
CREATE INDEX IF NOT EXISTS idx_squawks_created ON squawks(created_at DESC);

ALTER TABLE squawks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "squawks_select" ON squawks FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "squawks_insert" ON squawks FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "squawks_update" ON squawks FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "squawks_delete" ON squawks FOR DELETE
  USING (organization_id = ANY(get_my_org_ids()));

-- ─── 4. Maintenance requests ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  requester_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  target_mechanic_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  message TEXT,
  squawk_ids UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','converted_to_wo')),
  created_work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_maint_req_org ON maintenance_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_maint_req_target ON maintenance_requests(target_mechanic_user_id);
CREATE INDEX IF NOT EXISTS idx_maint_req_status ON maintenance_requests(status);

ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maint_req_select" ON maintenance_requests FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "maint_req_insert" ON maintenance_requests FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "maint_req_update" ON maintenance_requests FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));

-- ─── 5. Parts library (saved parts with markup) ─────────────────────────────

CREATE TABLE IF NOT EXISTS parts_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  part_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  category TEXT,
  preferred_vendor TEXT,
  vendor_url TEXT,
  base_price NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  markup_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (markup_mode IN ('percent','custom_rate','none')),
  markup_percent NUMERIC(8,2) DEFAULT 0,
  custom_rate NUMERIC(12,2),
  condition TEXT DEFAULT 'new'
    CHECK (condition IN ('new','overhauled','serviceable','used','as_removed','refurbished','unknown')),
  last_ordered_at TIMESTAMPTZ,
  usage_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, part_number, COALESCE(preferred_vendor, ''))
);

CREATE INDEX IF NOT EXISTS idx_parts_lib_org ON parts_library(organization_id);
CREATE INDEX IF NOT EXISTS idx_parts_lib_pn ON parts_library(part_number);
CREATE INDEX IF NOT EXISTS idx_parts_lib_last_ordered ON parts_library(last_ordered_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_parts_lib_usage ON parts_library(usage_count DESC);

ALTER TABLE parts_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parts_lib_select" ON parts_library FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "parts_lib_insert" ON parts_library FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "parts_lib_update" ON parts_library FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "parts_lib_delete" ON parts_library FOR DELETE
  USING (organization_id = ANY(get_my_org_ids()));

-- ─── 6. Labor rate cards ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS labor_rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  mechanic_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labor_rates_org ON labor_rate_cards(organization_id);
ALTER TABLE labor_rate_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labor_rates_select" ON labor_rate_cards FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "labor_rates_insert" ON labor_rate_cards FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "labor_rates_update" ON labor_rate_cards FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "labor_rates_delete" ON labor_rate_cards FOR DELETE
  USING (organization_id = ANY(get_my_org_ids()));

-- ─── 7. WO chat attachments on thread_messages ──────────────────────────────

ALTER TABLE thread_messages
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN thread_messages.attachments IS
  'Array of {kind:"image"|"audio"|"file", path:string, name:string, size:number, transcript?:string}';

-- ─── 8. Stripe Connect on org memberships ────────────────────────────────────

ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 9. Invoice payment & email tracking ─────────────────────────────────────

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS stripe_payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_sent_to TEXT;

-- ─── 10. Invoice reminders ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  kind TEXT NOT NULL DEFAULT 'polite_reminder'
    CHECK (kind IN ('upcoming_due','overdue','polite_reminder','final_notice','custom')),
  recipient_email TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','sent','cancelled','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_rem_org ON invoice_reminders(organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_rem_invoice ON invoice_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_rem_scheduled ON invoice_reminders(scheduled_for)
  WHERE status = 'scheduled';

ALTER TABLE invoice_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_rem_select" ON invoice_reminders FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "inv_rem_insert" ON invoice_reminders FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "inv_rem_update" ON invoice_reminders FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));

-- ─── 11. Flight Schedule Pro sync log ────────────────────────────────────────
-- (extends existing integration_sync_logs, no new table needed)
-- Squawks can have source='flight_schedule_pro' and source_metadata storing FSP IDs.

-- ─── 12. Customer phone + CSV import helper columns ─────────────────────────

-- Already has: name, company, email, phone, billing_address, notes, tags
-- Add secondary contact fields if missing:
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS secondary_email TEXT,
  ADD COLUMN IF NOT EXISTS secondary_phone TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS import_source TEXT;

-- ─── Done ────────────────────────────────────────────────────────────────────
