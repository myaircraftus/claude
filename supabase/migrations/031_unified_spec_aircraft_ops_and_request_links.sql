-- Migration 031: aircraft operation profiles and reminder-linked maintenance requests

ALTER TABLE aircraft
  ADD COLUMN IF NOT EXISTS operation_types TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_aircraft_operation_types
  ON aircraft USING GIN (operation_types);

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS request_source TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS source_reminder_id UUID REFERENCES reminders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_summary TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'maintenance_requests_request_source_check'
  ) THEN
    ALTER TABLE maintenance_requests
      ADD CONSTRAINT maintenance_requests_request_source_check
      CHECK (request_source IN ('general', 'reminder', 'squawk'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_maint_req_source_reminder
  ON maintenance_requests(source_reminder_id);

CREATE INDEX IF NOT EXISTS idx_maint_req_request_source
  ON maintenance_requests(organization_id, request_source);
