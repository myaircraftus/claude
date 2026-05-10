-- Migration 111: Phase 16 Sprint 16.6 — daily cost snapshots
--
-- Daily roll-up of platform costs from ai_activity_log (Anthropic),
-- Modal API (vision GPU spend), and Stripe (payment processor fees
-- when v1 billing launches). One row per day per source.
--
-- Production reads vision_worker_heartbeat (already exists, mig 102)
-- + vision_index_jobs (mig 098) for the worker/queue dashboard;
-- this migration only adds the cost roll-up table.
--
-- This migration is NOT applied automatically. Andy applies via tsx-pg.

CREATE TYPE cost_source AS ENUM (
  'anthropic',
  'modal',
  'stripe',
  'vercel',
  'supabase',
  'other'
);

CREATE TABLE cost_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /** UTC date this row is summarising. */
  snapshot_date date NOT NULL,
  source        cost_source NOT NULL,
  /** Spend in USD cents (integer to avoid float drift). */
  spend_cents   bigint NOT NULL DEFAULT 0,
  /** Optional unit count (e.g. token totals, embedding count). */
  unit_count    bigint,
  /** Optional unit name to interpret unit_count. */
  unit_name     text,
  /** Source-specific roll-up details. */
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (snapshot_date, source)
);

CREATE INDEX cost_snapshots_date_idx ON cost_snapshots(snapshot_date DESC);
CREATE INDEX cost_snapshots_source_date_idx ON cost_snapshots(source, snapshot_date DESC);

ALTER TABLE cost_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY cost_snapshots_admin_select ON cost_snapshots
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

-- Inserts/updates go through service-role only.

COMMENT ON TABLE cost_snapshots IS
  'Phase 16 Sprint 16.6 — daily cost roll-ups by source. Filled by lib/ops/cost-tracker.ts.';
