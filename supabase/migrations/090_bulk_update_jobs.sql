-- Cross-cutting Concern 3 — Bulk Update Queue
--
-- One job row per "apply patch X to N rows of entity_type T". Jobs run
-- async via waitUntil(processBulkJob) from the create endpoint. The
-- /(app)/org/bulk-updates page lists history; mechanic+/owner/admin
-- can create jobs.
--
-- entity_type intentionally TEXT — a closed allowlist lives in
-- lib/bulk/processor.ts. patch is a JSONB blob; the processor
-- whitelists which keys per entity type are safe to bulk-update.

CREATE TABLE IF NOT EXISTS bulk_update_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     text NOT NULL,
  entity_ids      uuid[] NOT NULL,
  patch           jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending','running','completed','failed'
                  )),
  results_count   int NOT NULL DEFAULT 0,
  error_message   text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS bulk_update_jobs_org_recent_idx
  ON bulk_update_jobs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bulk_update_jobs_status_idx
  ON bulk_update_jobs (organization_id, status);

ALTER TABLE bulk_update_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read bulk_update_jobs" ON bulk_update_jobs;
CREATE POLICY "Org members read bulk_update_jobs"
  ON bulk_update_jobs FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

DROP POLICY IF EXISTS "Mechanic+ create bulk_update_jobs" ON bulk_update_jobs;
CREATE POLICY "Mechanic+ create bulk_update_jobs"
  ON bulk_update_jobs FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_memberships
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
      AND role IN ('owner','admin','mechanic')
  ));
