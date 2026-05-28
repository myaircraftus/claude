/**
 * Force re-contextualization of ONE document's canonical chunks.
 *
 * Why a separate script (vs running wave2-contextualize.mjs): the wave2 script
 * processes anything where context_text IS NULL across the entire org. We want
 * a surgical run scoped to ONE doc so cost + behavior is predictable.
 *
 * Pipeline mirrors lib/rag/contextual.ts (the in-ingestion path) — now that
 * the direct-chunking short-circuit is removed, each chunk gets an LLM blurb.
 *
 * Steps:
 *   1. Read all canonical chunks for the doc
 *   2. For each: build deterministic line + LLM blurb (gpt-4o-mini, JSON mode)
 *   3. Re-embed (context_text || chunk_text) via text-embedding-3-large
 *   4. UPSERT canonical_document_chunks.context_text + canonical_document_embeddings.embedding
 *
 * Cost: ~$0.005/chunk LLM + ~$0.0001/chunk embed = ~$0.30 for 55 chunks.
 * Safe to re-run — idempotent (each run regenerates).
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

const TARGET_DOC = process.argv[2] || '03e526e8-7c9b-4bba-873a-c7ac4c606f4c'
const CTX_MODEL = 'gpt-4o-mini'
const EMBED_MODEL = 'text-embedding-3-large'
const LLM_CONCURRENCY = 8

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface Chunk {
  id: string
  document_id: string
  organization_id: string
  aircraft_id: string | null
  page_number: number | null
  chunk_index: number
  section_title: string | null
  chunk_text: string | null
  metadata_json: any
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  let idx = 0
  const out = new Array<R>(items.length)
  async function lane() {
    while (idx < items.length) {
      const i = idx++
      out[i] = await worker(items[i], i)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length || 1) }, lane),
  )
  return out
}

function deterministicLine(
  chunk: Chunk,
  doc: { title?: string; doc_type?: string } | undefined,
  ac: { tail_number?: string; make?: string; model?: string } | undefined,
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

function buildWindow(group: Chunk[], idx: number, charCap = 2000): string {
  const start = Math.max(0, idx - 5)
  const end = Math.min(group.length, idx + 6)
  let text = ''
  for (let i = start; i < end; i++) {
    if (i === idx) continue
    const t = (group[i].chunk_text || '').trim()
    if (!t) continue
    text += t + '\n---\n'
    if (text.length >= charCap) break
  }
  return text.slice(0, charCap)
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatDateMulti(iso: string): string | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const month = parseInt(m[2], 10)
  const day = parseInt(m[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${MONTH_NAMES[month - 1]} ${day}, ${m[1]} (${iso})`
}

function extractStructuredIdentifiers(chunk: Chunk): string {
  const fm = chunk?.metadata_json?.family_metadata
  if (!fm || typeof fm !== 'object') return ''
  const parts: string[] = []
  const dateFields: Array<[string, string]> = [
    ['entry_date_iso', 'Date'],
    ['open_date_iso', 'Open date'],
    ['close_date_iso', 'Close date'],
    ['effective_date_iso', 'Effective date'],
    ['compliance_date_iso', 'Compliance date'],
    ['inspection_date_iso', 'Inspection date'],
  ]
  for (const [field, label] of dateFields) {
    const v = fm[field]
    if (typeof v === 'string') {
      const f = formatDateMulti(v)
      if (f) parts.push(`${label}: ${f}`)
    }
  }
  const mech: string[] = []
  if (typeof fm.mechanic_name === 'string' && fm.mechanic_name.length > 0) mech.push(fm.mechanic_name)
  if (typeof fm.mechanic_cert === 'string' && fm.mechanic_cert.length > 0) mech.push(`A&P ${fm.mechanic_cert}`)
  if (typeof fm.ia_number === 'string' && fm.ia_number.length > 0) mech.push(`IA ${fm.ia_number}`)
  if (mech.length > 0) parts.push(`Mechanic: ${mech.join(' ')}`)
  for (const [field, label] of [['tach_time_text', 'Tach'], ['airframe_tt_text', 'Airframe TT'], ['tsmoh_text', 'TSMOH']] as Array<[string, string]>) {
    const v = fm[field]
    if (typeof v === 'string' && v.length > 0) parts.push(`${label}: ${v}`)
  }
  if (Array.isArray(fm.ad_references) && fm.ad_references.length > 0) parts.push(`AD: ${fm.ad_references.join(', ')}`)
  if (Array.isArray(fm.part_numbers) && fm.part_numbers.length > 0) parts.push(`Parts: ${fm.part_numbers.join(', ')}`)
  if (typeof fm.work_order_number === 'string' && fm.work_order_number.length > 0) parts.push(`WO: ${fm.work_order_number}`)
  if (typeof fm.ad_number === 'string' && fm.ad_number.length > 0) parts.push(`AD #: ${fm.ad_number}`)
  if (typeof fm.sb_number === 'string' && fm.sb_number.length > 0) parts.push(`SB #: ${fm.sb_number}`)
  if (typeof fm.subject === 'string' && fm.subject.length > 0) parts.push(`Subject: ${fm.subject}`)
  if (typeof fm.inspection_type === 'string' && fm.inspection_type.length > 0) parts.push(`Inspection: ${fm.inspection_type}`)
  if (typeof fm.tail_number === 'string' && fm.tail_number.length > 0) parts.push(`Tail: ${fm.tail_number}`)
  return parts.join('; ')
}

async function generateBlurb(
  group: Chunk[],
  idx: number,
  detLine: string,
): Promise<string> {
  const chunk = group[idx]
  const window = buildWindow(group, idx)
  const structuredIdents = extractStructuredIdentifiers(chunk)
  let summary = ''
  let identifiers = ''
  try {
    const resp = await openai.chat.completions.create({
      model: CTX_MODEL,
      temperature: 0,
      max_tokens: 240,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You situate an excerpt within its aircraft-maintenance document so it can be retrieved on its own (logbooks, manuals, ADs, SBs, work orders). When <extracted_fields> are present, weave the date and mechanic/signer into your context sentence using natural English ("Month Day, Year") so date-anchored queries match. Reply with strict JSON: {"context": "<1-2 plain sentences situating this chunk — include any extracted date and mechanic name>", "identifiers": "<comma-separated AD/SB/STC numbers, part numbers, serial numbers, dates, tach/Hobbs times from the chunk or <extracted_fields>; empty string if none>"}. Never invent facts.',
        },
        {
          role: 'user',
          content:
            `<document>${detLine}</document>\n\n` +
            `<surrounding_excerpts>\n${window || '(none)'}\n</surrounding_excerpts>\n\n` +
            `<extracted_fields>\n${structuredIdents || '(none)'}\n</extracted_fields>\n\n` +
            `<chunk>\n${(chunk.chunk_text || '').slice(0, 4000)}\n</chunk>`,
        },
      ],
    })
    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}')
    if (typeof parsed.context === 'string') summary = parsed.context.trim()
    if (typeof parsed.identifiers === 'string')
      identifiers = parsed.identifiers.trim()
  } catch (err) {
    console.warn('  blurb failed for chunk', chunk.id.slice(0, 8), '-', (err as Error).message)
  }
  let ctx = detLine
  if (summary) ctx += `\n${summary}`
  if (identifiers) ctx += `\nKey references: ${identifiers}`
  // Belt-and-suspenders: always append structured identifiers so high-signal
  // fields land in the embedding text even if LLM omitted them.
  if (structuredIdents) ctx += `\nFields: ${structuredIdents}`
  return ctx
}

async function main() {
  console.log(`[recontextualize] target doc: ${TARGET_DOC}`)

  // 1. Fetch chunks
  const { data: chunks, error } = await supabase
    .from('canonical_document_chunks')
    .select('id, document_id, organization_id, aircraft_id, page_number, chunk_index, section_title, chunk_text, metadata_json')
    .eq('document_id', TARGET_DOC)
    .order('chunk_index', { ascending: true })
  if (error || !chunks || chunks.length === 0) {
    console.error('no chunks found:', error?.message)
    process.exit(1)
  }
  console.log(`[recontextualize] fetched ${chunks.length} chunks`)

  // 2. Doc + aircraft metadata for the deterministic line
  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, doc_type, aircraft_id')
    .eq('id', TARGET_DOC)
    .maybeSingle()
  let ac: { tail_number?: string; make?: string; model?: string } | undefined
  const acId = chunks[0].aircraft_id || (doc as any)?.aircraft_id || null
  if (acId) {
    const { data: acRow } = await supabase
      .from('aircraft')
      .select('tail_number, make, model')
      .eq('id', acId)
      .maybeSingle()
    ac = (acRow as any) ?? undefined
  }
  console.log(`[recontextualize] doc: ${(doc as any)?.title} (${(doc as any)?.doc_type})`)
  console.log(`[recontextualize] aircraft: ${ac?.tail_number ?? '?'} ${ac?.make ?? ''} ${ac?.model ?? ''}`)

  // 3. Generate blurbs
  console.log(`\n[recontextualize] generating ${chunks.length} blurbs at concurrency ${LLM_CONCURRENCY}...`)
  const t0 = Date.now()
  const blurbs = await runPool(chunks as Chunk[], LLM_CONCURRENCY, async (chunk, i) => {
    const detLine = deterministicLine(chunk, doc as any, ac)
    const ctx = await generateBlurb(chunks as Chunk[], i, detLine)
    if (i % 10 === 0) process.stdout.write(`.${i}`)
    return ctx
  })
  console.log(`\n[recontextualize] blurbs done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  // 4. Build embedding text + re-embed in batches
  const embedTexts = chunks.map((c, i) => {
    const ctx = blurbs[i]
    return `${ctx}\n\n${c.chunk_text ?? ''}`
  })

  // The DB column is pgvector(1536); text-embedding-3-large defaults to 3072.
  // Must pass dimensions: 1536 (matches lib/openai/embeddings.ts).
  console.log(`[recontextualize] embedding ${embedTexts.length} chunks (1536-dim, batch 50)...`)
  const t1 = Date.now()
  const embeddings: number[][] = []
  for (let i = 0; i < embedTexts.length; i += 50) {
    const batch = embedTexts.slice(i, i + 50)
    const resp = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: batch,
      dimensions: 1536,
    })
    for (const item of resp.data) embeddings.push(item.embedding)
  }
  console.log(`[recontextualize] embeddings done in ${((Date.now() - t1) / 1000).toFixed(1)}s`)

  // 5. Persist — context_text on chunks, then embedding on canonical_document_embeddings
  console.log(`[recontextualize] writing context_text + embeddings...`)
  let updatedChunks = 0
  let updatedEmbs = 0
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    const ctx = blurbs[i]
    const emb = embeddings[i]

    // Update context_text on the chunk
    const u1 = await supabase
      .from('canonical_document_chunks')
      .update({ context_text: ctx })
      .eq('id', c.id)
    if (!u1.error) updatedChunks++
    else console.error(`  chunk update ${c.id.slice(0, 8)} failed: ${u1.error.message}`)

    // Upsert the embedding (overwrite the existing one). Include all NOT NULL
    // columns (document_id, chunk_id, organization_id) so the upsert satisfies
    // the schema constraints whether it's INSERT or UPDATE.
    const u2 = await supabase.from('canonical_document_embeddings').upsert(
      {
        chunk_id: c.id,
        document_id: c.document_id,
        organization_id: c.organization_id,
        embedding: emb,
      },
      { onConflict: 'chunk_id' },
    )
    if (!u2.error) updatedEmbs++
    else console.error(`  embedding upsert ${c.id.slice(0, 8)} failed: ${u2.error.message}`)
  }
  console.log(`[recontextualize] updated ${updatedChunks} context_text, ${updatedEmbs} embeddings`)

  // 6. Sanity sample
  console.log(`\n─── Sample context_text values ───`)
  const sampleIds = [chunks[0].id, chunks[Math.floor(chunks.length / 2)].id, chunks[chunks.length - 1].id]
  for (const id of sampleIds) {
    const { data } = await supabase
      .from('canonical_document_chunks')
      .select('id, page_number, chunk_text, context_text')
      .eq('id', id)
      .maybeSingle()
    if (data) {
      console.log(`\n[chunk ${id.slice(0, 8)} p${(data as any).page_number}]`)
      console.log(`  chunk_text (first 100): ${((data as any).chunk_text ?? '').slice(0, 100).replace(/\n/g, ' ')}`)
      console.log(`  context_text:`)
      console.log(`    ${((data as any).context_text ?? '').split('\n').join('\n    ')}`)
    }
  }
}

main().catch((err) => {
  console.error('[recontextualize] fatal:', err)
  process.exit(1)
})
