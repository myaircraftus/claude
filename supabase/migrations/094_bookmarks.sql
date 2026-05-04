-- Sprint 6.6 — Bookmarks (per-user pinned items).
--
-- One row per (user × org × entity_type × entity_id). entity_type is
-- intentionally open TEXT (no enum) so any URL-addressable surface can
-- be bookmarked without a schema change. label + url are denormalized
-- so the bookmarks page renders without N+1 fetches per item.

CREATE TABLE IF NOT EXISTS bookmarks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     text NOT NULL,
  entity_id       text NOT NULL,
  label           text NOT NULL,
  url             text NOT NULL,
  position        int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Unique per (user × org × entity_type × entity_id) — toggling a star
-- twice should NOT create two rows.
CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_user_entity_unique
  ON bookmarks (user_id, organization_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS bookmarks_user_position_idx
  ON bookmarks (user_id, organization_id, position ASC);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Self read bookmarks" ON bookmarks;
CREATE POLICY "Self read bookmarks"
  ON bookmarks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Self write bookmarks" ON bookmarks;
CREATE POLICY "Self write bookmarks"
  ON bookmarks FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
