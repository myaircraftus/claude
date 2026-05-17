/**
 * PageIndex hierarchical tree-index — shared types.
 *
 * This is a *layer on top of* the existing vector RAG pipeline. The vector
 * pipeline chunks + embeds documents for similarity search; this layer adds a
 * navigable hierarchy (document → chapter → section → page/entry) so retrieval
 * and the UI can reason about *where* a chunk lives, not just how similar it is.
 *
 * Tree nodes are persisted in the `page_tree_nodes` table. Each node points at
 * the `document_chunks` rows that fall underneath it via `chunk_ids`, so a tree
 * walk can always recover the underlying chunk text for generation.
 */

/** A node level in the page-index tree. Ordered coarse → fine. */
export type PageNodeLevel = 'document' | 'chapter' | 'section' | 'page' | 'entry'

/**
 * A single node in a document's page-index tree. Mirrors a `page_tree_nodes`
 * row, minus the columns that are purely server-side bookkeeping
 * (`org_id`, `created_at`) — those are set at insert time, not carried in app
 * logic.
 */
export type PageNode = {
  id: string
  doc_id: string
  aircraft_id: string
  level: PageNodeLevel
  label: string
  ata_chapter?: number
  page_number?: number
  date?: string
  tach?: number
  summary: string
  parent_id?: string
  children_ids: string[]
  chunk_ids: string[]
  metadata: Record<string, unknown>
}

/** A `page_tree_nodes` row as it goes into Supabase (includes `org_id`). */
export type PageNodeRow = PageNode & { org_id: string }

/** Minimal shape of a `document_chunks` row consumed by the tree builder. */
export type TreeChunk = {
  id: string
  page_number: number | null
  chunk_index: number | null
  section_title: string | null
  chunk_text: string | null
}

/** Minimal shape of a `documents` row consumed by the tree builder. */
export type TreeDocument = {
  id: string
  title: string | null
  doc_type: string | null
  document_type: string | null
  organization_id: string
  aircraft_id: string | null
  page_count: number | null
}

/** Build a fresh PageNode with sensible defaults for the optional fields. */
export function makeNode(partial: Omit<PageNode, 'children_ids' | 'chunk_ids' | 'metadata'> &
  Partial<Pick<PageNode, 'children_ids' | 'chunk_ids' | 'metadata'>>): PageNode {
  return {
    children_ids: [],
    chunk_ids: [],
    metadata: {},
    ...partial,
  }
}
