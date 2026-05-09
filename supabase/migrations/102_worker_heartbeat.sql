-- Sprint 11.1 — Worker Heartbeat (Phase 11 hybrid architecture).
--
-- ⚠ NOT APPLIED — Andy applies via apps/web/scripts/apply-102.ts.
--
-- vision_worker_heartbeat is the liveness signal for the Colab-primary
-- / Modal-fallback dispatch pattern (Phase 11). The Colab queue worker
-- pings this table every 30s; the Modal fallback sweep cron reads it
-- to decide "is Colab alive?" before deciding whether to take over a
-- stuck job.
--
-- One row per worker (unique on worker_id, upserted). Workers are
-- global (not org-scoped) — only org admins can read.
--
-- Status state machine:
--   idle      → worker connected, waiting for jobs
--   busy      → worker processing a job
--   stopping  → worker shutting down cleanly (heartbeat thread fires
--               this on cell-stop in Colab)

CREATE TABLE IF NOT EXISTS vision_worker_heartbeat (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id                text NOT NULL,
  gpu_host                 text NOT NULL
    CHECK (gpu_host IN ('colab', 'colab-pro', 'colab-a100', 'modal', 'modal-stub', 'replicate', 'runpod', 'stub')),
  last_seen_at             timestamptz NOT NULL DEFAULT now(),
  status                   text NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'busy', 'stopping')),
  jobs_processed_total     int NOT NULL DEFAULT 0,
  last_job_id              uuid,
  last_error               text,
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Only one heartbeat row per worker_id. Upsert path uses this.
CREATE UNIQUE INDEX IF NOT EXISTS vision_worker_heartbeat_worker_id_unique
  ON vision_worker_heartbeat (worker_id);

-- "Is anything alive in the last 60s?" lookup — supports the fallback
-- cron's decision query and the admin /admin/vision/workers page.
CREATE INDEX IF NOT EXISTS vision_worker_heartbeat_last_seen_idx
  ON vision_worker_heartbeat (last_seen_at DESC);

-- Filter on active GPU host for cost/perf attribution.
CREATE INDEX IF NOT EXISTS vision_worker_heartbeat_host_status_idx
  ON vision_worker_heartbeat (gpu_host, status, last_seen_at DESC);

ALTER TABLE vision_worker_heartbeat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins read vision_worker_heartbeat" ON vision_worker_heartbeat;
CREATE POLICY "Org admins read vision_worker_heartbeat"
  ON vision_worker_heartbeat FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND role IN ('owner', 'admin')
  ));

-- Writes happen exclusively through service-role (Colab notebook
-- + Modal fallback cron both bypass RLS). No INSERT/UPDATE policy
-- for authenticated role.

-- updated_at trigger — keeps the row's modification time fresh on
-- every upsert (don't rely on the worker to set it).
CREATE OR REPLACE FUNCTION trg_vision_worker_heartbeat_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vision_worker_heartbeat_set_updated_at ON vision_worker_heartbeat;
CREATE TRIGGER vision_worker_heartbeat_set_updated_at
  BEFORE UPDATE ON vision_worker_heartbeat
  FOR EACH ROW EXECUTE FUNCTION trg_vision_worker_heartbeat_set_updated_at();

COMMENT ON TABLE  vision_worker_heartbeat IS 'Worker liveness signals for Phase 11 hybrid Colab/Modal dispatch.';
COMMENT ON COLUMN vision_worker_heartbeat.worker_id IS 'Stable per-worker id (e.g. colab-<uuid> or modal-prod). Unique.';
COMMENT ON COLUMN vision_worker_heartbeat.gpu_host IS 'Which backend the worker uses; dictates job affinity.';
COMMENT ON COLUMN vision_worker_heartbeat.status IS 'idle | busy | stopping';
COMMENT ON COLUMN vision_worker_heartbeat.last_seen_at IS 'Updated every 30s by the heartbeat thread; sweep cron checks if > 60s stale.';
