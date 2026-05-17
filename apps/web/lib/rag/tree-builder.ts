/**
 * PageIndex tree builder.
 *
 * `buildDocumentTree()` reads a document + its `document_chunks`, infers a
 * hierarchy appropriate to the document type, optionally summarizes each node
 * with an LLM, and writes the result into `page_tree_nodes` (replacing any
 * existing tree for that document).
 *
 * This is additive: it never touches `documents`, `document_chunks`, or the
 * embedding tables. If `OPENAI_API_KEY` is absent the builder still produces a
 * structurally complete tree with derived (non-AI) labels — it never throws on
 * a missing key or a failed AI call.
 */
import OpenAI from 'openai'
import { createServiceSupabase } from '@/lib/supabase/server'
import {
  makeNode,
  type PageNode,
  type PageNodeRow,
  type TreeChunk,
  type TreeDocument,
} from './page-tree'

/** Chunks grouped under a shared key (year, ATA chapter, section, page). */
type ChunkGroup = { key: string; label: string; chunks: TreeChunk[] }

const AI_MODEL = 'gpt-4o-mini'
/** Cap chunk text fed to the model so a huge doc can't blow the context. */
const SUMMARY_INPUT_CHARS = 1800

/**
 * Build (or rebuild) the page-index tree for a single document.
 * Returns the number of `page_tree_nodes` rows inserted.
 */
export async function buildDocumentTree(
  docId: string,
  aircraftId: string,
): Promise<{ nodesCreated: number }> {
  const supabase = createServiceSupabase()

  const { data: docRow, error: docErr } = await supabase
    .from('documents')
    .select('id, title, doc_type, document_type, organization_id, aircraft_id, page_count')
    .eq('id', docId)
    .maybeSingle()

  if (docErr) throw new Error(`tree-builder: failed to load document ${docId}: ${docErr.message}`)
  if (!docRow) throw new Error(`tree-builder: document ${docId} not found`)
  const doc = docRow as TreeDocument

  const { data: chunkRows, error: chunkErr } = await supabase
    .from('document_chunks')
    .select('id, page_number, chunk_index, section_title, chunk_text')
    .eq('document_id', docId)
    .order('chunk_index', { ascending: true })

  if (chunkErr) {
    throw new Error(`tree-builder: failed to load chunks for ${docId}: ${chunkErr.message}`)
  }
  const chunks = (chunkRows ?? []) as TreeChunk[]

  // Rebuild = replace: drop any prior tree for this document.
  const { error: delErr } = await supabase.from('page_tree_nodes').delete().eq('doc_id', docId)
  if (delErr) {
    throw new Error(`tree-builder: failed to clear prior tree for ${docId}: ${delErr.message}`)
  }

  const orgId = doc.organization_id
  const docType = `${doc.doc_type ?? ''} ${doc.document_type ?? ''}`.toLowerCase()

  // --- Document root --------------------------------------------------------
  const root: PageNode = makeNode({
    id: crypto.randomUUID(),
    doc_id: docId,
    aircraft_id: aircraftId,
    level: 'document',
    label: doc.title ?? 'Untitled document',
    summary: '',
    metadata: { doc_type: doc.doc_type, document_type: doc.document_type, kind: classifyDoc(docType) },
  })

  const nodes: PageNode[] = [root]
  const kind = classifyDoc(docType)

  if (kind === 'logbook') {
    buildLogbookTree(root, chunks, nodes, docId, aircraftId)
  } else if (kind === 'manual') {
    buildManualTree(root, chunks, nodes, docId, aircraftId)
  } else if (kind === 'form') {
    buildFormTree(root, chunks, nodes, docId, aircraftId)
  } else {
    buildGenericTree(root, chunks, nodes, docId, aircraftId)
  }

  // --- Summaries ------------------------------------------------------------
  await summarizeNodes(nodes, chunks)

  // --- Persist --------------------------------------------------------------
  const rows: PageNodeRow[] = nodes.map((n) => ({ ...n, org_id: orgId }))
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('page_tree_nodes').insert(rows)
    if (insErr) throw new Error(`tree-builder: insert failed for ${docId}: ${insErr.message}`)
  }

  return { nodesCreated: rows.length }
}

// ---------------------------------------------------------------------------
// Doc-type classification
// ---------------------------------------------------------------------------

type DocKind = 'logbook' | 'manual' | 'form' | 'generic'

/**
 * Map a document's free-text type fields onto a tree shape.
 * Ambiguous types fall back to 'generic' (document → page).
 */
function classifyDoc(docType: string): DocKind {
  if (docType.includes('logbook')) return 'logbook'
  if (docType.includes('form_337') || docType.includes('form 337') || docType.includes('stc')) {
    return 'form'
  }
  if (
    docType.includes('manual') ||
    docType.includes('poh') ||
    docType.includes('afm') ||
    docType.includes('parts_catalog') ||
    docType.includes('parts catalog')
  ) {
    return 'manual'
  }
  return 'generic'
}

// ---------------------------------------------------------------------------
// Tree shapes
// ---------------------------------------------------------------------------

/** Logbook: document → year (chapter) → entry. */
function buildLogbookTree(
  root: PageNode,
  chunks: TreeChunk[],
  nodes: PageNode[],
  docId: string,
  aircraftId: string,
): void {
  // One entry node per chunk; group entries by the year of their parsed date.
  const groups = new Map<string, { label: string; entries: PageNode[] }>()

  for (const chunk of chunks) {
    const date = parseEntryDate(chunk.chunk_text)
    const tach = parseTach(chunk.chunk_text)
    const year = date ? date.slice(0, 4) : 'undated'

    const entry: PageNode = makeNode({
      id: crypto.randomUUID(),
      doc_id: docId,
      aircraft_id: aircraftId,
      level: 'entry',
      label: entryLabel(chunk, date),
      summary: '',
      date: date ?? undefined,
      tach: tach ?? undefined,
      page_number: chunk.page_number ?? undefined,
      chunk_ids: [chunk.id],
      metadata: { chunk_index: chunk.chunk_index },
    })
    nodes.push(entry)

    const g = groups.get(year) ?? { label: year === 'undated' ? 'Undated entries' : year, entries: [] }
    g.entries.push(entry)
    groups.set(year, g)
  }

  // Sort years ascending; 'undated' last.
  const years = [...groups.keys()].sort((a, b) => {
    if (a === 'undated') return 1
    if (b === 'undated') return -1
    return a.localeCompare(b)
  })

  for (const year of years) {
    const g = groups.get(year)!
    const yearNode: PageNode = makeNode({
      id: crypto.randomUUID(),
      doc_id: docId,
      aircraft_id: aircraftId,
      level: 'chapter',
      label: g.label,
      summary: '',
      parent_id: root.id,
      children_ids: g.entries.map((e) => e.id),
      chunk_ids: g.entries.flatMap((e) => e.chunk_ids),
      metadata: { year, entry_count: g.entries.length },
    })
    for (const e of g.entries) e.parent_id = yearNode.id
    nodes.push(yearNode)
    root.children_ids.push(yearNode.id)
  }

  root.chunk_ids = chunks.map((c) => c.id)
}

/** Manual / POH / AFM / parts catalog: document → ATA chapter → section → page. */
function buildManualTree(
  root: PageNode,
  chunks: TreeChunk[],
  nodes: PageNode[],
  docId: string,
  aircraftId: string,
): void {
  // Group by inferred ATA chapter, then by section title, then by page.
  type ChapterAcc = {
    ata: number | null
    label: string
    sections: Map<string, { label: string; chunks: TreeChunk[] }>
  }
  const chapters = new Map<string, ChapterAcc>()

  for (const chunk of chunks) {
    const ata = inferAtaChapter(chunk.section_title) ?? inferAtaChapter(chunk.chunk_text)
    const chapterKey = ata != null ? `ata-${ata}` : 'general'
    const chapterLabel =
      ata != null ? `ATA ${String(ata).padStart(2, '0')}` : 'General / unclassified'

    const chapter =
      chapters.get(chapterKey) ?? { ata, label: chapterLabel, sections: new Map() }
    const sectionKey = (chunk.section_title ?? '').trim() || `page-${chunk.page_number ?? 0}`
    const sectionLabel = (chunk.section_title ?? '').trim() || `Page ${chunk.page_number ?? '?'}`

    const section = chapter.sections.get(sectionKey) ?? { label: sectionLabel, chunks: [] }
    section.chunks.push(chunk)
    chapter.sections.set(sectionKey, section)
    chapters.set(chapterKey, chapter)
  }

  for (const [chapterKey, chapter] of chapters) {
    const chapterNode: PageNode = makeNode({
      id: crypto.randomUUID(),
      doc_id: docId,
      aircraft_id: aircraftId,
      level: 'chapter',
      label: chapter.label,
      summary: '',
      parent_id: root.id,
      ata_chapter: chapter.ata ?? undefined,
      metadata: { chapter_key: chapterKey },
    })
    nodes.push(chapterNode)
    root.children_ids.push(chapterNode.id)

    for (const [sectionKey, section] of chapter.sections) {
      const sectionNode: PageNode = makeNode({
        id: crypto.randomUUID(),
        doc_id: docId,
        aircraft_id: aircraftId,
        level: 'section',
        label: section.label,
        summary: '',
        parent_id: chapterNode.id,
        ata_chapter: chapter.ata ?? undefined,
        metadata: { section_key: sectionKey },
      })
      nodes.push(sectionNode)
      chapterNode.children_ids.push(sectionNode.id)

      // One page node per distinct page_number within the section.
      const pages = groupByPage(section.chunks)
      for (const page of pages) {
        const pageNode: PageNode = makeNode({
          id: crypto.randomUUID(),
          doc_id: docId,
          aircraft_id: aircraftId,
          level: 'page',
          label: page.label,
          summary: '',
          parent_id: sectionNode.id,
          ata_chapter: chapter.ata ?? undefined,
          page_number: page.chunks[0]?.page_number ?? undefined,
          chunk_ids: page.chunks.map((c) => c.id),
          metadata: {},
        })
        nodes.push(pageNode)
        sectionNode.children_ids.push(pageNode.id)
      }
      sectionNode.chunk_ids = sectionNode.children_ids.length
        ? section.chunks.map((c) => c.id)
        : []
    }
    chapterNode.chunk_ids = [...chapter.sections.values()].flatMap((s) =>
      s.chunks.map((c) => c.id),
    )
  }

  root.chunk_ids = chunks.map((c) => c.id)
}

/** Form 337 / STC: document → entry (flat — one entry per logical record). */
function buildFormTree(
  root: PageNode,
  chunks: TreeChunk[],
  nodes: PageNode[],
  docId: string,
  aircraftId: string,
): void {
  // Treat each page as one logical record; merge chunks sharing a page number.
  const pages = groupByPage(chunks)
  for (const page of pages) {
    const text = page.chunks.map((c) => c.chunk_text ?? '').join(' ')
    const date = parseEntryDate(text)
    const entry: PageNode = makeNode({
      id: crypto.randomUUID(),
      doc_id: docId,
      aircraft_id: aircraftId,
      level: 'entry',
      label: formRecordLabel(page.chunks[0], date),
      summary: '',
      date: date ?? undefined,
      page_number: page.chunks[0]?.page_number ?? undefined,
      parent_id: root.id,
      chunk_ids: page.chunks.map((c) => c.id),
      metadata: { record: true },
    })
    nodes.push(entry)
    root.children_ids.push(entry.id)
  }
  root.chunk_ids = chunks.map((c) => c.id)
}

/** Generic fallback: document → page (one node per page). */
function buildGenericTree(
  root: PageNode,
  chunks: TreeChunk[],
  nodes: PageNode[],
  docId: string,
  aircraftId: string,
): void {
  const pages = groupByPage(chunks)
  for (const page of pages) {
    const pageNode: PageNode = makeNode({
      id: crypto.randomUUID(),
      doc_id: docId,
      aircraft_id: aircraftId,
      level: 'page',
      label: page.label,
      summary: '',
      parent_id: root.id,
      page_number: page.chunks[0]?.page_number ?? undefined,
      chunk_ids: page.chunks.map((c) => c.id),
      metadata: {},
    })
    nodes.push(pageNode)
    root.children_ids.push(pageNode.id)
  }
  root.chunk_ids = chunks.map((c) => c.id)
}

// ---------------------------------------------------------------------------
// Grouping + parsing helpers
// ---------------------------------------------------------------------------

/** Group chunks by `page_number` (chunks without a page get their own group). */
function groupByPage(chunks: TreeChunk[]): ChunkGroup[] {
  const byPage = new Map<string, TreeChunk[]>()
  for (const chunk of chunks) {
    const key = chunk.page_number != null ? `p${chunk.page_number}` : `idx${chunk.chunk_index}`
    const list = byPage.get(key) ?? []
    list.push(chunk)
    byPage.set(key, list)
  }
  return [...byPage.entries()].map(([key, list]) => ({
    key,
    label: list[0]?.page_number != null ? `Page ${list[0].page_number}` : 'Page',
    chunks: list,
  }))
}

/** Parse the first ISO-ish date out of a chunk's text, normalized to YYYY-MM-DD. */
function parseEntryDate(text: string | null): string | null {
  if (!text) return null
  // ISO: 2024-03-15
  const iso = text.match(/\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/)
  if (iso) return iso[0]
  // US: 3/15/2024 or 03-15-24
  const us = text.match(/\b(0?[1-9]|1[0-2])[/\-](0?[1-9]|[12]\d|3[01])[/\-](\d{2}|\d{4})\b/)
  if (us) {
    const mm = us[1].padStart(2, '0')
    const dd = us[2].padStart(2, '0')
    let yyyy = us[3]
    if (yyyy.length === 2) yyyy = (Number(yyyy) > 50 ? '19' : '20') + yyyy
    return `${yyyy}-${mm}-${dd}`
  }
  return null
}

/** Parse a tach / Hobbs / total-time reading out of a chunk's text. */
function parseTach(text: string | null): number | null {
  if (!text) return null
  const m = text.match(/\b(?:tach|hobbs|ttaf|total\s*time|tt)\b[^\d]{0,12}(\d{1,6}(?:\.\d{1,2})?)/i)
  if (m) {
    const n = Number(m[1])
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Infer an ATA chapter number (0–99) from a heading or section title.
 * Recognizes explicit "ATA NN" / "Chapter NN" markers; returns null otherwise.
 */
function inferAtaChapter(text: string | null): number | null {
  if (!text) return null
  const ata = text.match(/\bATA\s*(?:chapter\s*)?(\d{1,3})\b/i)
  if (ata) {
    const n = Number(ata[1])
    if (n >= 0 && n <= 99) return n
  }
  const ch = text.match(/\bchapter\s*(\d{1,3})\b/i)
  if (ch) {
    const n = Number(ch[1])
    if (n >= 0 && n <= 99) return n
  }
  return null
}

/** Build a short label for a logbook entry node. */
function entryLabel(chunk: TreeChunk, date: string | null): string {
  if (date) return `Entry — ${date}`
  if (chunk.section_title?.trim()) return chunk.section_title.trim().slice(0, 80)
  return `Entry (page ${chunk.page_number ?? '?'})`
}

/** Build a short label for a Form 337 / STC record node. */
function formRecordLabel(chunk: TreeChunk | undefined, date: string | null): string {
  const title = chunk?.section_title?.trim()
  if (title) return title.slice(0, 80)
  if (date) return `Record — ${date}`
  return `Record (page ${chunk?.page_number ?? '?'})`
}

// ---------------------------------------------------------------------------
// AI summaries
// ---------------------------------------------------------------------------

/**
 * Fill in each node's `summary`. With an OpenAI key, asks the model for a
 * 1–2 sentence summary per node from the underlying chunk text. Without a key,
 * or on any failure, falls back to a derived label-based summary. Never throws.
 */
async function summarizeNodes(nodes: PageNode[], chunks: TreeChunk[]): Promise<void> {
  const chunkText = new Map(chunks.map((c) => [c.id, c.chunk_text ?? '']))

  const derived = (n: PageNode): string => {
    const sample = n.chunk_ids
      .map((id) => chunkText.get(id) ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (sample) return `${n.label}. ${sample.slice(0, 160)}`.trim()
    return `${n.label} (${n.level}).`
  }

  if (!process.env.OPENAI_API_KEY) {
    for (const n of nodes) n.summary = derived(n)
    return
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000, maxRetries: 1 })

  // Only summarize content-bearing nodes via AI; pre-fill the rest.
  const targets = nodes.filter((n) => n.chunk_ids.length > 0)
  for (const n of nodes) n.summary = derived(n)

  // Batch nodes into a single JSON request to keep token + call cost low.
  const items = targets.map((n) => ({
    id: n.id,
    level: n.level,
    label: n.label,
    text: n.chunk_ids
      .map((id) => chunkText.get(id) ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, SUMMARY_INPUT_CHARS),
  }))

  // Chunk the request so a very large document doesn't exceed the model limit.
  const BATCH = 25
  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH)
    try {
      const completion = await openai.chat.completions.create({
        model: AI_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You summarize sections of aircraft maintenance documents for a search index. ' +
              'For each item, write a factual 1-2 sentence summary of what that section covers. ' +
              'Respond ONLY with JSON of the form ' +
              '{"summaries":[{"id":"<id>","summary":"<text>"}]}. ' +
              'Keep each summary under 240 characters. Do not invent facts not in the text.',
          },
          {
            role: 'user',
            content: JSON.stringify({ items: slice }),
          },
        ],
      })
      const raw = completion.choices[0]?.message?.content ?? '{}'
      const parsed = JSON.parse(raw) as { summaries?: { id?: string; summary?: string }[] }
      const byId = new Map(nodes.map((n) => [n.id, n]))
      for (const s of parsed.summaries ?? []) {
        if (s.id && typeof s.summary === 'string' && s.summary.trim()) {
          const node = byId.get(s.id)
          if (node) node.summary = s.summary.trim().slice(0, 480)
        }
      }
    } catch {
      // AI summary is an enhancement — derived summaries already in place.
    }
  }
}
