-- Cross-cutting Concern 5 — Configurable Dashboard widgets
--
-- One row per (user × org × persona) — three personas can have three
-- different layouts for the same user in the same org. Caller upserts
-- on the unique (user_id, organization_id, persona).
--
-- widgets shape (validated at the API layer):
--   [{ id: string, type: string, position: { x, y, w, h }, config: { ... }, favorite: boolean }, ...]
--
-- Schema-first per cross-cutting cleanup; full drag-and-drop UI lives
-- in components/dashboard/* (this sprint ships the scaffold; @dnd-kit
-- wiring is logged as a follow-up).

CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  persona         text NOT NULL CHECK (persona IN ('owner','mechanic','shop','admin')),
  widgets         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_layouts_user_org_persona_unique
  ON dashboard_layouts (user_id, organization_id, persona);

ALTER TABLE dashboard_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Self read dashboard_layouts" ON dashboard_layouts;
CREATE POLICY "Self read dashboard_layouts"
  ON dashboard_layouts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Self write dashboard_layouts" ON dashboard_layouts;
CREATE POLICY "Self write dashboard_layouts"
  ON dashboard_layouts FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION dashboard_layouts_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dashboard_layouts_updated_at_trg ON dashboard_layouts;
CREATE TRIGGER dashboard_layouts_updated_at_trg
  BEFORE UPDATE ON dashboard_layouts
  FOR EACH ROW EXECUTE FUNCTION dashboard_layouts_set_updated_at();
