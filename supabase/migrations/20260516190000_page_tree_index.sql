-- PageIndex hierarchical tree index.
--
-- Layers structured "where in the document" reasoning on top of the existing
-- RAG pipeline. page_tree_nodes stores a hierarchy (document → chapter/year →
-- section → page/entry) per document; each node links back to the real
-- vector chunks via chunk_ids. The existing OCR → embedding → vector search
-- pipeline is untouched.
--
-- Org-membership RLS via get_my_org_ids() (same pattern as the other tables).

CREATE TABLE IF NOT EXISTS page_tree_nodes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id        UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  aircraft_id   UUID REFERENCES aircraft(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  level         TEXT NOT NULL
                CHECK (level IN ('document', 'chapter', 'section', 'page', 'entry')),
  label         TEXT NOT NULL,
  ata_chapter   INTEGER,
  page_number   INTEGER,
  date          DATE,
  tach          NUMERIC,
  summary       TEXT NOT NULL DEFAULT '',
  parent_id     UUID REFERENCES page_tree_nodes(id) ON DELETE CASCADE,
  children_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
  chunk_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_tree_nodes_aircraft_level ON page_tree_nodes(aircraft_id, level);
CREATE INDEX IF NOT EXISTS idx_page_tree_nodes_doc ON page_tree_nodes(doc_id);
CREATE INDEX IF NOT EXISTS idx_page_tree_nodes_parent ON page_tree_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_page_tree_nodes_org ON page_tree_nodes(org_id);

ALTER TABLE page_tree_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS page_tree_nodes_read ON page_tree_nodes;
CREATE POLICY page_tree_nodes_read ON page_tree_nodes
  FOR SELECT USING (org_id = ANY(get_my_org_ids()));

DROP POLICY IF EXISTS page_tree_nodes_write ON page_tree_nodes;
CREATE POLICY page_tree_nodes_write ON page_tree_nodes
  FOR ALL
  USING (org_id = ANY(get_my_org_ids()))
  WITH CHECK (org_id = ANY(get_my_org_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON page_tree_nodes TO authenticated;

COMMENT ON TABLE page_tree_nodes IS 'PageIndex hierarchical document-structure tree. Nodes link to real vector chunks via chunk_ids; enables location-aware retrieval.';

-- Private storage bucket for the persisted BM25 keyword indexes
-- (rag-indexes/{aircraft_id}/bm25.json). Written + read server-side by the
-- service client, so no storage.objects RLS policy is required.
INSERT INTO storage.buckets (id, name, public)
VALUES ('rag-indexes', 'rag-indexes', FALSE)
ON CONFLICT (id) DO NOTHING;
