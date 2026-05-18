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
import OpenAI from 'openai'
import { generateEmbeddings } from '@/lib/openai/embeddings'

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

async function generateContext(
  openai: OpenAI,
  group: CanonChunk[],
  idx: number,
  detLine: string,
): Promise<string> {
  const chunk = group[idx]
  const window = buildWindow(group, idx)
  let summary = ''
  let identifiers = ''
  try {
    const resp = await openai.chat.completions.create({
      model: CTX_MODEL,
      temperature: 0,
      max_tokens: 220,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You situate an excerpt within its aircraft-maintenance document so it ' +
            'can be retrieved on its own (logbooks, manuals, ADs, SBs, work orders). ' +
            'Reply with strict JSON: {"context": "<1-2 plain sentences situating this ' +
            'chunk — what aircraft/component/event/section it belongs to>", ' +
            '"identifiers": "<comma-separated AD/SB/STC numbers, part numbers, serial ' +
            'numbers, dates, tach/Hobbs times literally present in the chunk; empty ' +
            'string if none>"}. Never invent facts not supported by the text.',
        },
        {
          role: 'user',
          content:
            `<document>${detLine}</document>\n\n` +
            `<surrounding_excerpts>\n${window || '(none)'}\n</surrounding_excerpts>\n\n` +
            `<chunk>\n${(chunk.chunk_text || '').slice(0, 4000)}\n</chunk>`,
        },
      ],
    })
    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}')
    if (typeof parsed.context === 'string') summary = parsed.context.trim()
    if (typeof parsed.identifiers === 'string') identifiers = parsed.identifiers.trim()
  } catch {
    // Best-effort — deterministic line alone is still a real improvement.
  }
  let ctx = detLine
  if (summary) ctx += `\n${summary}`
  if (identifiers) ctx += `\nKey references: ${identifiers}`
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
    const { data: chunkRows, error: chunkErr } = await supabase
      .from('canonical_document_chunks')
      .select('id, document_id, organization_id, aircraft_id, page_number, chunk_index, section_title, chunk_text')
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

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large'

    // 1. Generate context for every chunk.
    const contexts = await runPool(group, LLM_CONCURRENCY, (chunk, i) =>
      generateContext(openai, group, i, deterministicLine(chunk, doc, ac)),
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
