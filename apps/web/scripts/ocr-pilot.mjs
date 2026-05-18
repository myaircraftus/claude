#!/usr/bin/env node
/**
 * OCR-quality pilot — does a GPT-4o vision re-transcription beat the current
 * OCR on the garbled scanned logbook pages?
 *
 * For a random sample of logbook pages it:
 *   1. pulls the CURRENT OCR text (canonical_document_chunks for that page),
 *   2. re-transcribes the page IMAGE with gpt-4o vision,
 *   3. has gpt-4o-mini judge which transcription is more accurate / less
 *      garbled, and score the improvement 0-10,
 *   4. reports the win-rate, mean improvement, measured cost/page, and an
 *      extrapolation to the full ~15,300-page corpus.
 *
 * READ-ONLY against the DB. Spends a small amount of OpenAI vision tokens
 * (~$0.50-1). Credentials from apps/web/.env.local.
 *
 * USAGE
 *   cd apps/web
 *   node scripts/ocr-pilot.mjs
 *
 * OPTIONS (env)
 *   OCR_PILOT_PAGES        Sample size (default 40)
 *   OCR_PILOT_CONCURRENCY  Parallel pages (default 6)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const HERE = dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  const env = {}
  try {
    for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      env[m[1]] = v
    }
  } catch (e) {
    console.error(`[ocr-pilot] could not read .env.local: ${e.message}`)
  }
  return env
}
const fileEnv = loadEnvLocal()
const getEnv = (k) => process.env[k] || fileEnv[k] || ''

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL')
const SUPABASE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
const OPENAI_KEY = getEnv('OPENAI_API_KEY')
if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error('[ocr-pilot] missing credentials in apps/web/.env.local')
  process.exit(1)
}

const SAMPLE = Math.max(4, Number(process.env.OCR_PILOT_PAGES) || 40)
const CONCURRENCY = Math.max(1, Number(process.env.OCR_PILOT_CONCURRENCY) || 6)
const CORPUS_PAGES = 15319 // ocr_page_jobs rowcount (measured 2026-05-18)
const VISION_BUCKET = 'vision-pages'
// USD per 1M tokens.
const PRICE = { vis_in: 2.5, vis_out: 10, judge_in: 0.15, judge_out: 0.6 }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
const openai = new OpenAI({ apiKey: OPENAI_KEY })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function withRetry(fn, label) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const status = err?.status ?? 0
      if ((status !== 429 && status < 500) || attempt === 5) throw err
      const delay = Math.min(3000 * 2 ** (attempt - 1), 60000)
      console.warn(`[ocr-pilot] ${label} retry ${attempt}/5 in ${delay / 1000}s (status ${status})`)
      await sleep(delay)
    }
  }
}

async function runPool(items, concurrency, worker) {
  let idx = 0
  const out = new Array(items.length)
  async function lane() {
    while (idx < items.length) {
      const i = idx++
      out[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, lane))
  return out
}

/** Rough gibberish ratio — fraction of alpha tokens that look like OCR garbage. */
function gibberishRatio(text) {
  const tokens = (text || '').split(/\s+/).filter((t) => /[a-zA-Z]/.test(t))
  if (tokens.length === 0) return 1
  let bad = 0
  for (const t of tokens) {
    const clean = t.replace(/[^a-zA-Z]/g, '')
    const looksOk = clean.length >= 2 && clean.length <= 18 && /[aeiouy]/i.test(clean) &&
      clean.length / t.length > 0.6
    if (!looksOk) bad++
  }
  return bad / tokens.length
}

async function pickSample() {
  // Logbook documents, then their rendered pages (no FK relationship is
  // exposed to PostgREST, so do it in two explicit steps).
  const { data: docs, error: docErr } = await supabase
    .from('documents')
    .select('id')
    .eq('doc_type', 'logbook')
  if (docErr) throw new Error(`documents query: ${docErr.message}`)
  const docIds = (docs || []).map((d) => d.id)
  if (docIds.length === 0) throw new Error('no logbook documents found')

  const pages = []
  for (let i = 0; i < docIds.length; i += 100) {
    const { data, error } = await supabase
      .from('vision_pages')
      .select('id, source_document_id, page_number, page_image_path')
      .in('source_document_id', docIds.slice(i, i + 100))
      .not('page_image_path', 'is', null)
      .is('deleted_at', null)
    if (error) throw new Error(`vision_pages query: ${error.message}`)
    pages.push(...(data || []))
  }
  const shuffled = pages.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  // For each candidate, pull the current OCR text for that page; keep ones
  // that actually have OCR text until we have SAMPLE pages.
  const chosen = []
  for (const p of shuffled) {
    if (chosen.length >= SAMPLE) break
    const { data: chunks } = await supabase
      .from('canonical_document_chunks')
      .select('chunk_text, chunk_index')
      .eq('document_id', p.source_document_id)
      .eq('page_number', p.page_number)
      .order('chunk_index', { ascending: true })
    const ocrText = (chunks || []).map((c) => c.chunk_text || '').join('\n').trim()
    if (ocrText.length < 40) continue
    chosen.push({ ...p, ocrText })
  }
  return chosen
}

async function signedUrl(path) {
  const { data, error } = await supabase.storage.from(VISION_BUCKET).createSignedUrl(path, 900)
  if (error) throw new Error(`signedUrl(${path}): ${error.message}`)
  return data.signedUrl
}

async function processPage(page, tally) {
  const url = await signedUrl(page.page_image_path)

  // 1. gpt-4o vision re-transcription.
  const visResp = await withRetry(
    () =>
      openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'This is a scanned page from an aircraft maintenance logbook. ' +
                  'Transcribe ALL text on the page as accurately as possible — ' +
                  'including handwriting, stamps, dates, tach/Hobbs times, part ' +
                  'numbers, signatures and certificate numbers. Preserve numbers ' +
                  'exactly. Output only the transcription, no commentary.',
              },
              { type: 'image_url', image_url: { url, detail: 'high' } },
            ],
          },
        ],
      }),
    'vision',
  )
  const vu = visResp.usage || {}
  tally.visIn += vu.prompt_tokens || 0
  tally.visOut += vu.completion_tokens || 0
  const newText = (visResp.choices?.[0]?.message?.content || '').trim()

  // 2. gpt-4o-mini judge.
  const judgeResp = await withRetry(
    () =>
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You compare two transcriptions of the same scanned aircraft ' +
              'logbook page. Reply strict JSON: {"winner":"A"|"B"|"EQUAL",' +
              '"b_improvement":<0-10 integer, how much better B is than A; 0 if ' +
              'B is not better>,"note":"<short reason>"}. Judge accuracy, ' +
              'completeness and absence of garbled gibberish.',
          },
          {
            role: 'user',
            content:
              `TRANSCRIPTION A (current OCR):\n${page.ocrText.slice(0, 4000)}\n\n` +
              `TRANSCRIPTION B (new):\n${newText.slice(0, 4000)}`,
          },
        ],
      }),
    'judge',
  )
  const ju = judgeResp.usage || {}
  tally.judgeIn += ju.prompt_tokens || 0
  tally.judgeOut += ju.completion_tokens || 0
  let verdict = { winner: 'EQUAL', b_improvement: 0, note: '' }
  try {
    verdict = JSON.parse(judgeResp.choices?.[0]?.message?.content || '{}')
  } catch {
    /* keep default */
  }

  return {
    page: `${page.source_document_id}#${page.page_number}`,
    ocr_gibberish: +gibberishRatio(page.ocrText).toFixed(2),
    new_gibberish: +gibberishRatio(newText).toFixed(2),
    ocr_len: page.ocrText.length,
    new_len: newText.length,
    winner: verdict.winner || 'EQUAL',
    b_improvement: Number(verdict.b_improvement) || 0,
    note: verdict.note || '',
  }
}

async function main() {
  console.log(`[ocr-pilot] sampling ${SAMPLE} logbook pages, concurrency ${CONCURRENCY}`)
  const sample = await pickSample()
  if (sample.length === 0) {
    console.error('[ocr-pilot] no logbook pages with both an image and OCR text found.')
    process.exit(1)
  }
  console.log(`[ocr-pilot] processing ${sample.length} pages with gpt-4o vision...`)

  const tally = { visIn: 0, visOut: 0, judgeIn: 0, judgeOut: 0 }
  const t0 = Date.now()
  let done = 0
  const results = await runPool(sample, CONCURRENCY, async (page) => {
    try {
      const r = await processPage(page, tally)
      done++
      if (done % 10 === 0) console.log(`[ocr-pilot]   ${done}/${sample.length}`)
      return r
    } catch (err) {
      done++
      return { page: `${page.source_document_id}#${page.page_number}`, error: String(err?.message || err) }
    }
  })

  const ok = results.filter((r) => !r.error)
  const bWins = ok.filter((r) => r.winner === 'B').length
  const aWins = ok.filter((r) => r.winner === 'A').length
  const ties = ok.filter((r) => r.winner === 'EQUAL').length
  const meanImprovement = ok.reduce((s, r) => s + r.b_improvement, 0) / (ok.length || 1)
  const meanOcrGib = ok.reduce((s, r) => s + r.ocr_gibberish, 0) / (ok.length || 1)
  const meanNewGib = ok.reduce((s, r) => s + r.new_gibberish, 0) / (ok.length || 1)

  const cost =
    (tally.visIn / 1e6) * PRICE.vis_in + (tally.visOut / 1e6) * PRICE.vis_out +
    (tally.judgeIn / 1e6) * PRICE.judge_in + (tally.judgeOut / 1e6) * PRICE.judge_out
  const costPerPage = cost / (ok.length || 1)
  // Full-run would be vision only (no judge): estimate from vision share.
  const visCost = (tally.visIn / 1e6) * PRICE.vis_in + (tally.visOut / 1e6) * PRICE.vis_out
  const fullRunCost = (visCost / (ok.length || 1)) * CORPUS_PAGES

  const report = {
    generated_at: new Date().toISOString(),
    sample_pages: ok.length,
    errors: results.length - ok.length,
    verdict: { b_wins: bWins, a_wins: aWins, ties },
    mean_b_improvement_0_10: +meanImprovement.toFixed(2),
    mean_gibberish_ratio: { current_ocr: +meanOcrGib.toFixed(3), gpt4o_vision: +meanNewGib.toFixed(3) },
    pilot_cost_usd: +cost.toFixed(2),
    cost_per_page_usd: +costPerPage.toFixed(4),
    full_corpus_retranscribe_cost_usd: +fullRunCost.toFixed(0),
    full_corpus_pages: CORPUS_PAGES,
    elapsed_min: +((Date.now() - t0) / 60000).toFixed(1),
    per_page: results,
  }
  writeFileSync(resolve(process.cwd(), 'ocr-pilot-results.json'), JSON.stringify(report, null, 2))

  console.log('\n══════════ OCR-QUALITY PILOT — RESULTS ══════════')
  console.log(`Pages compared:      ${ok.length}` + (report.errors ? `  (${report.errors} errored)` : ''))
  console.log(`gpt-4o vision wins:  ${bWins}/${ok.length}   ties ${ties}   current-OCR wins ${aWins}`)
  console.log(`Mean improvement:    ${meanImprovement.toFixed(1)} / 10`)
  console.log(`Gibberish ratio:     current OCR ${meanOcrGib.toFixed(2)}  →  gpt-4o vision ${meanNewGib.toFixed(2)}`)
  console.log('─────────────────────────────────────────────────')
  console.log(`Pilot cost:          $${cost.toFixed(2)}   (${costPerPage.toFixed(4)}/page incl. judge)`)
  console.log(`Full re-transcribe:  ~$${fullRunCost.toFixed(0)} for ${CORPUS_PAGES.toLocaleString()} pages (vision only)`)
  console.log('═══════════════════════════════════════════════════')
  console.log('\nFull report: ocr-pilot-results.json')
}

main().catch((err) => {
  console.error('[ocr-pilot] FATAL:', err?.stack || err?.message || err)
  process.exit(1)
})
