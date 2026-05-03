-- Cross-cutting Concern 4 — Soft-delete + 30-day Trash retention
--
-- Adds deleted_at timestamptz NULL to every user-deletable table. A NULL
-- value means "live"; a non-NULL value means "trashed at this time".
--
-- Existing list queries are NOT migrated yet — that's a follow-up rollout
-- per-list (logged in §8). New code paths added in this sprint use the
-- helper in lib/trash/scope.ts which appends `.is('deleted_at', null)`
-- to every query. The cron /api/cron/trash-purge purges anything with
-- deleted_at older than 30 days.

ALTER TABLE work_orders          ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE inspections          ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE compliance_items     ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE continued_items      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE cost_entries         ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE documents            ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE customers            ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE vendors              ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE inventory_parts      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE purchase_orders      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE approval_requests    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE tools                ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE serial_components    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE core_obligations     ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Hot path: trash page + purge cron filter on (org, deleted_at).
CREATE INDEX IF NOT EXISTS work_orders_deleted_at_idx       ON work_orders          (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS inspections_deleted_at_idx       ON inspections          (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS compliance_items_deleted_at_idx  ON compliance_items     (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS continued_items_deleted_at_idx   ON continued_items      (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS cost_entries_deleted_at_idx      ON cost_entries         (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_deleted_at_idx         ON documents            (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_deleted_at_idx         ON customers            (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS vendors_deleted_at_idx           ON vendors              (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_parts_deleted_at_idx   ON inventory_parts      (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_orders_deleted_at_idx   ON purchase_orders      (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS approval_requests_deleted_at_idx ON approval_requests    (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS tools_deleted_at_idx             ON tools                (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS serial_components_deleted_at_idx ON serial_components    (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS core_obligations_deleted_at_idx  ON core_obligations     (organization_id, deleted_at) WHERE deleted_at IS NOT NULL;
