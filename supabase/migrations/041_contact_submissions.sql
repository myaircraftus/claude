-- ============================================================================
-- Migration 041: Contact Form Submissions
-- Stores marketing-site contact form submissions for sales/support triage.
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general'
    CHECK (type IN ('sales','support','general')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','read','archived')),
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created
  ON contact_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status
  ON contact_submissions(status);

-- Public endpoint writes via service-role; keep RLS enabled and lock down reads.
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- No public policies — reads/writes go through the service-role client on the
-- server. Admins can be granted access via a future admin policy if needed.
