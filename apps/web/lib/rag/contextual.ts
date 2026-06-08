/**
 * Wave 2 — Contextual Retrieval (pipeline side).
 *
 * `contextualizeCanonicalDocument` runs at the end of ingestion for a freshly
 * ingested document. For every canonical chunk it generates a SHORT context
 * blurb — a deterministic identifier line (aircraft / document / section /
 * page) plus a 1-2 sentence LLM summary and any AD/SB/part/date identifiers —
 * writes it to canonical_document_chunks.context_text, and re-embeds
 * (context_text || chunk_text) into canonical_document_embeddings.
 *
 * chunk_text is never modified — it stays the verbatim cited source.
 *
 * STRICTLY best-effort: it never throws. If OPENAI_API_KEY is absent, or a
 * call fails, the document keeps its raw chunks + raw embeddings (exactly the
 * pre-Wave-2 behaviour) and ingestion is unaffected. The standalone
 * scripts/wave2-contextualize.mjs backfill will pick up anything left with a
 * NULL context_text on its next run.
 *
 * This mirrors the per-document logic of scripts/wave2-contextualize.mjs; the
 * two are kept separate because the script is a standalone .mjs tool and this
 * runs inside the Next.js ingestion path.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { generateEmbeddings } from '@/lib/openai/embeddings'
import { DIRECT_CHUNKING_SOURCE_TAG } from '@/lib/ocr/direct-chunking'
import { generateLlmObject } from '@/lib/ai/llm'

// Migrated to the unified AI SDK layer (lib/ai/llm).
const ContextSchema = z.object({
  context: z.string().nullable().optional(),
  identifiers: z.string().nullable().optional(),
})

const CTX_MODEL = process.env.WAVE2_CTX_MODEL || 'gpt-4o-mini'
const LLM_CONCURRENCY = 12
const WINDOW_EACH_SIDE = 5
const WINDOW_CHAR_CAP = 2000
const EMBED_BATCH = 100

interface CanonChunk {
  id: string
  document_id: string
  organization_id: string
  aircraft_id: string | null
  page_number: number | null
  chunk_index: number
  section_title: string | null
  chunk_text: string | null
  // Populated for direct-chunking canonical chunks so we can skip the LLM
  // context-blurb call (chunks already carry family-aware semantic context
  // from the vision-model call). Other chunks have an empty / legacy shape.
  metadata_json: Record<string, unknown> | null
}

async function runPool<T, R>(items: T[], concurrency: number, worker: (item: T, i: number) => Promise<R>): Promise<R[]> {
  let idx = 0
  const out = new Array<R>(items.length)
  async function lane() {
    while (idx < items.length) {
      const i = idx++
      out[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, lane))
  return out
}

function deterministicLine(
  chunk: CanonChunk,
  doc: { title?: string | null; doc_type?: string | null } | undefined,
  ac: { tail_number?: string | null; make?: string | null; model?: string | null } | undefined,
): string {
  const parts: string[] = []
  if (ac?.tail_number) parts.push(ac.tail_number)
  const mm = [ac?.make, ac?.model].filter(Boolean).join(' ')
  if (mm) parts.push(mm)
  if (doc?.doc_type) parts.push(doc.doc_type)
  if (doc?.title) parts.push(doc.title)
  if (chunk.section_title) parts.push(chunk.section_title)
  if (chunk.page_number != null) parts.push(`p${chunk.page_number}`)
  return parts.join(' · ')
}

function buildWindow(group: CanonChunk[], idx: number): string {
  const start = Math.max(0, idx - WINDOW_EACH_SIDE)
  const end = Math.min(group.length, idx + WINDOW_EACH_SIDE + 1)
  let text = ''
  for (let i = start; i < end; i++) {
    if (i === idx) continue
    const t = (group[i].chunk_text || '').trim()
    if (!t) continue
    text += t + '\n---\n'
    if (text.length >= WINDOW_CHAR_CAP) break
  }
  return text.slice(0, WINDOW_CHAR_CAP)
}

function isDirectChunkingChunk(chunk: CanonChunk): boolean {
  const source = (chunk.metadata_json as { source?: unknown } | null)?.source
  return source === DIRECT_CHUNKING_SOURCE_TAG
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

function formatDateMulti(iso: string): string | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const month = parseInt(m[2], 10)
  const day = parseInt(m[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${MONTH_NAMES[month - 1]} ${day}, ${m[1]} (${iso})`
}

/** Extract high-signal identifiers from family_metadata as a single string the
 *  Wave 2 LLM can weave into the blurb AND that we deterministically append to
 *  context_text. This is what makes date-anchored queries match short signoff
 *  chunks whose own text lacks the date — the date+mechanic+cert come from
 *  family_metadata (already extracted at ingestion) and land in the embedding
 *  text + BM25 tsvector via context_text. */
function extractStructuredIdentifiers(chunk: CanonChunk): string {
  const fm = (chunk.metadata_json as { family_metadata?: Record<string, unknown> } | null)?.family_metadata
  if (!fm || typeof fm !== 'object') return ''
  const f = fm as Record<string, unknown>
  const parts: string[] = []

  // Dates — formatted as "Month Day, Year (YYYY-MM-DD)" so both natural-language
  // and ISO queries match. Any populated date field counts; the field name
  // labels which kind of date it is (entry / open / close / effective / etc.).
  const dateFields: Array<[string, string]> = [
    ['entry_date_iso', 'Date'],
    ['open_date_iso', 'Open date'],
    ['close_date_iso', 'Close date'],
    ['effective_date_iso', 'Effective date'],
    ['compliance_date_iso', 'Compliance date'],
    ['inspection_date_iso', 'Inspection date'],
  ]
  for (const [field, label] of dateFields) {
    const v = f[field]
    if (typeof v === 'string') {
      const formatted = formatDateMulti(v)
      if (formatted) parts.push(`${label}: ${formatted}`)
    }
  }

  // Mechanic / signer
  const mech: string[] = []
  if (typeof f.mechanic_name === 'string' && f.mechanic_name.length > 0) mech.push(f.mechanic_name)
  if (typeof f.mechanic_cert === 'string' && f.mechanic_cert.length > 0) mech.push(`A&P ${f.mechanic_cert}`)
  if (typeof f.ia_number === 'string' && f.ia_number.length > 0) mech.push(`IA ${f.ia_number}`)
  if (mech.length > 0) parts.push(`Mechanic: ${mech.join(' ')}`)

  // Hour/tach readings
  for (const [field, label] of [['tach_time_text', 'Tach'], ['airframe_tt_text', 'Airframe TT'], ['tsmoh_text', 'TSMOH']]) {
    const v = f[field]
    if (typeof v === 'string' && v.length > 0) parts.push(`${label}: ${v}`)
  }

  // Reference numbers
  if (Array.isArray(f.ad_references) && f.ad_references.length > 0)
    parts.push(`AD: ${(f.ad_references as string[]).join(', ')}`)
  if (Array.isArray(f.part_numbers) && f.part_numbers.length > 0)
    parts.push(`Parts: ${(f.part_numbers as string[]).join(', ')}`)
  if (typeof f.work_order_number === 'string' && f.work_order_number.length > 0)
    parts.push(`WO: ${f.work_order_number}`)
  if (typeof f.ad_number === 'string' && f.ad_number.length > 0)
    parts.push(`AD #: ${f.ad_number}`)
  if (typeof f.sb_number === 'string' && f.sb_number.length > 0)
    parts.push(`SB #: ${f.sb_number}`)
  if (typeof f.subject === 'string' && f.subject.length > 0)
    parts.push(`Subject: ${f.subject}`)
  if (typeof f.inspection_type === 'string' && f.inspection_type.length > 0)
    parts.push(`Inspection: ${f.inspection_type}`)
  if (typeof f.tail_number === 'string' && f.tail_number.length > 0)
    parts.push(`Tail: ${f.tail_number}`)

  return parts.join('; ')
}

async function generateContext(
  group: CanonChunk[],
  idx: number,
  detLine: string,
): Promise<string> {
  const chunk = group[idx]
  // Note: previously short-circuited for direct-chunking chunks here, on the
  // assumption that family-aware chunks already carried enough context. That
  // assumption broke for short signoff/header chunks whose text is e.g. just
  // "I certify... [name] A&P [number]" — no date or aircraft context in the
  // chunk text itself, even though family_metadata has both. Now the LLM
  // blurb runs uniformly AND family_metadata fields are explicitly fed to the
  // prompt as <extracted_fields> so the date/mechanic land in the blurb.
  // Cost: ~$0.005/chunk on gpt-4o-mini.
  const window = buildWindow(group, idx)
  const structuredIdents = extractStructuredIdentifiers(chunk)
  let summary = ''
  let identifiers = ''
  try {
    const { object: parsed } = await generateLlmObject({
      model: CTX_MODEL,
      schema: ContextSchema,
      temperature: 0,
      maxOutputTokens: 240,
      system:
        'You situate an excerpt within its aircraft-maintenance document so it ' +
        'can be retrieved on its own (logbooks, manuals, ADs, SBs, work orders). ' +
        'When <extracted_fields> are present, weave the date and mechanic/signer ' +
        'into your context sentence using natural English ("Month Day, Year") so ' +
        'date-anchored queries match. ' +
        'Reply with strict JSON: {"context": "<1-2 plain sentences situating this ' +
        'chunk — include any extracted date and mechanic name>", ' +
        '"identifiers": "<comma-separated AD/SB/STC numbers, part numbers, serial ' +
        'numbers, dates, tach/Hobbs times from the chunk or <extracted_fields>; ' +
        'empty string if none>"}. Never invent facts.',
      prompt:
        `<document>${detLine}</document>\n\n` +
        `<surrounding_excerpts>\n${window || '(none)'}\n</surrounding_excerpts>\n\n` +
        `<extracted_fields>\n${structuredIdents || '(none)'}\n</extracted_fields>\n\n` +
        `<chunk>\n${(chunk.chunk_text || '').slice(0, 4000)}\n</chunk>`,
    })
    if (typeof parsed.context === 'string') summary = parsed.context.trim()
    if (typeof parsed.identifiers === 'string') identifiers = parsed.identifiers.trim()
  } catch {
    // Best-effort — deterministic line alone is still a real improvement.
  }
  let ctx = detLine
  if (summary) ctx += `\n${summary}`
  if (identifiers) ctx += `\nKey references: ${identifiers}`
  // Belt-and-suspenders: always append the structured identifiers. Guarantees
  // the high-signal fields land in the embedding text even if the LLM blurb
  // omitted them (which it did for short signoff chunks in the prior version).
  if (structuredIdents) ctx += `\nFields: ${structuredIdents}`
  return ctx
}

/**
 * Generate + persist contextual chunks for one freshly-ingested document.
 * Never throws. Returns a small summary for logging.
 */
export async function contextualizeCanonicalDocument(
  supabase: SupabaseClient,
  documentId: string,
): Promise<{ contextualized: number; total: number; skipped: boolean; reason?: string }> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { contextualized: 0, total: 0, skipped: true, reason: 'no OPENAI_API_KEY' }
    }

    // Only chunks not already contextualized (idempotent / resumable).
    // metadata_json is selected so direct-chunking chunks can be detected
    // and short-circuit the LLM call (see isDirectChunkingChunk above).
    const { data: chunkRows, error: chunkErr } = await supabase
      .from('canonical_document_chunks')
      .select('id, document_id, organization_id, aircraft_id, page_number, chunk_index, section_title, chunk_text, metadata_json')
      .eq('document_id', documentId)
      .is('context_text', null)
      .order('chunk_index', { ascending: true })
    if (chunkErr) return { contextualized: 0, total: 0, skipped: true, reason: chunkErr.message }
    const group = (chunkRows || []) as CanonChunk[]
    if (group.length === 0) return { contextualized: 0, total: 0, skipped: true, reason: 'nothing pending' }

    // Document + aircraft metadata for the deterministic context line.
    const { data: docRow } = await supabase
      .from('documents')
      .select('id, title, doc_type, aircraft_id')
      .eq('id', documentId)
      .maybeSingle()
    const doc = (docRow as { title?: string; doc_type?: string; aircraft_id?: string } | null) ?? undefined

    let ac: { tail_number?: string; make?: string; model?: string } | undefined
    const aircraftId = group[0].aircraft_id || doc?.aircraft_id || null
    if (aircraftId) {
      const { data: acRow } = await supabase
        .from('aircraft')
        .select('tail_number, make, model')
        .eq('id', aircraftId)
        .maybeSingle()
      ac = (acRow as { tail_number?: string; make?: string; model?: string } | null) ?? undefined
    }

    const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large'

    // 1. Generate context for every chunk.
    const contexts = await runPool(group, LLM_CONCURRENCY, (chunk, i) =>
      generateContext(group, i, deterministicLine(chunk, doc, ac)),
    )

    // 2. Re-embed (context || chunk_text), upsert embeddings, then write
    //    context_text LAST — so context_text != null ⇒ embedding is fresh.
    let contextualized = 0
    for (let i = 0; i < group.length; i += EMBED_BATCH) {
      const slice = group.slice(i, i + EMBED_BATCH)
      const sliceCtx = contexts.slice(i, i + EMBED_BATCH)
      let embeddings: Array<{ id: string; embedding: number[] }>
      try {
        embeddings = await generateEmbeddings(
          slice.map((c, k) => ({ id: String(k), text: `${sliceCtx[k]}\n\n${c.chunk_text || ''}` })),
        )
      } catch (err) {
        console.warn(`[wave2/contextual] embed batch failed for ${documentId}:`, err)
        continue // leave these chunks NULL — the backfill will retry them
      }

      const embedRows = embeddings
        .map((e) => {
          const k = Number(e.id)
          const c = slice[k]
          if (!c) return null
          return {
            chunk_id: c.id,
            document_id: c.document_id,
            organization_id: c.organization_id,
            aircraft_id: c.aircraft_id,
            embedding_model: embeddingModel,
            embedding: e.embedding,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r != null)

      const { error: embErr } = await supabase
        .from('canonical_document_embeddings')
        .upsert(embedRows, { onConflict: 'chunk_id' })
      if (embErr) {
        console.warn(`[wave2/contextual] embedding upsert failed for ${documentId}:`, embErr.message)
        continue
      }

      await runPool(slice, 12, async (c, k) => {
        const { error } = await supabase
          .from('canonical_document_chunks')
          .update({ context_text: sliceCtx[k] })
          .eq('id', c.id)
        if (!error) contextualized++
      })
    }

    return { contextualized, total: group.length, skipped: false }
  } catch (err) {
    console.warn(`[wave2/contextual] contextualizeCanonicalDocument failed for ${documentId}:`, err)
    return { contextualized: 0, total: 0, skipped: true, reason: String(err) }
  }
}
