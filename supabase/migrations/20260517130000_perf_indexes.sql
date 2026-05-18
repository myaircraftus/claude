-- Performance indexes for the shop ops list/dashboard surfaces.
--
-- Work Orders, Estimates and Invoices all run org-scoped list queries that
-- filter by status / aircraft and sort by created_at (or updated_at).
-- Without composite indexes Postgres falls back to a sequential scan + sort
-- over every row in the org once a tenant accumulates real data, which is
-- the dominant cost on those pages.
--
-- The squawks table already ships composite indexes on
-- (organization_id, status, created_at) and (aircraft_id, status, created_at)
-- from 20260514152339_squawks_discrepancy_intake.sql, so it is intentionally
-- omitted here — adding more would be redundant.
--
-- Indexes only — no column/table schema changes. Every statement is
-- IF NOT EXISTS so this migration is safe to re-run and a no-op for any
-- index that an earlier migration already created.

-- ── work_orders ────────────────────────────────────────────────────────────
-- List query: WHERE organization_id = ? AND deleted_at IS NULL [AND status = ?]
--             ORDER BY created_at DESC / updated_at DESC
CREATE INDEX IF NOT EXISTS idx_work_orders_org_status
  ON work_orders (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_work_orders_org_created_at
  ON work_orders (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_orders_org_updated_at
  ON work_orders (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_orders_aircraft
  ON work_orders (aircraft_id);

-- ── estimates ──────────────────────────────────────────────────────────────
-- List query: WHERE organization_id = ? [AND status = ?]
--             ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_estimates_org_status
  ON estimates (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_estimates_org_created_at
  ON estimates (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_aircraft
  ON estimates (aircraft_id);

-- ── invoices ───────────────────────────────────────────────────────────────
-- List query: WHERE organization_id = ? [AND status = ?]
--             ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_invoices_org_status
  ON invoices (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_org_created_at
  ON invoices (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_aircraft
  ON invoices (aircraft_id);
