-- reminders: aircraft maintenance reminders
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL, -- 'annual','100hr','transponder','elt','static_pitot','vor','ad_compliance','ad_due','ad_overdue','custom'
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active','snoozed','dismissed','completed'
  priority TEXT NOT NULL DEFAULT 'normal', -- 'low','normal','high','critical'
  due_date DATE,
  due_hours NUMERIC(10,1), -- aircraft hours when due
  current_hours NUMERIC(10,1), -- last known aircraft hours
  hours_remaining NUMERIC(10,1),
  days_remaining INT,
  ad_applicability_id UUID REFERENCES aircraft_ad_applicability(id),
  evidence_document_id UUID REFERENCES documents(id),
  auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
  snoozed_until DATE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reminders_aircraft ON reminders(aircraft_id);
CREATE INDEX idx_reminders_org ON reminders(organization_id);
CREATE INDEX idx_reminders_status ON reminders(status);
CREATE INDEX idx_reminders_due_date ON reminders(due_date);
CREATE INDEX idx_reminders_type ON reminders(reminder_type);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_member_reminders" ON reminders
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );
