-- ============================================================================
-- Migration 035: Feedback + Support Tickets (Admin Ops)
-- Adds: feedback, support_tickets
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  page TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','triaged','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_org ON feedback(organization_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_select" ON feedback FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "feedback_insert" ON feedback FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "feedback_update" ON feedback FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'general'
    CHECK (type IN ('general','billing','technical','abuse','feature')),
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','triaged','in_progress','resolved','closed')),
  subject TEXT,
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_org ON support_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_created ON support_tickets(created_at DESC);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_select" ON support_tickets FOR SELECT
  USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "support_insert" ON support_tickets FOR INSERT
  WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "support_update" ON support_tickets FOR UPDATE
  USING (organization_id = ANY(get_my_org_ids()));
