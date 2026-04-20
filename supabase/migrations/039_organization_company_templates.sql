ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS business_email TEXT,
  ADD COLUMN IF NOT EXISTS business_phone TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS company_address TEXT,
  ADD COLUMN IF NOT EXISTS invoice_footer TEXT,
  ADD COLUMN IF NOT EXISTS estimate_terms TEXT,
  ADD COLUMN IF NOT EXISTS work_order_terms TEXT,
  ADD COLUMN IF NOT EXISTS checklist_templates JSONB NOT NULL DEFAULT '{}'::jsonb;
