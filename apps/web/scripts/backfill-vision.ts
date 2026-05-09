/**
 * Phase 9.H — bulk vision backfill driver.
 *
 * Walks every document with no vision_pages yet, batches 5 at a time,
 * POSTs each batch to the Modal /backfill endpoint, sleeps 5s between
 * batches. Logs per-batch progress to stdout (also captured to
 * /tmp/backfill.log when run with `>` redirection).
 *
 * Kill-switch: touch /tmp/STOP_BACKFILL to halt cleanly after the
 * current batch.
 *
 * Cost cap: hard-stop if total Modal call time exceeds 4 hours of
 * wall-clock OR if 20% of pages fail (whichever first).
 *
 * Run:
 *   cd apps/web && npx tsx scripts/backfill-vision.ts
 *
 * Background:
 *   nohup npx tsx scripts/backfill-vision.ts > /tmp/backfill.log 2>&1 &
 *   echo $! > /tmp/backfill.pid
 */
import { Client } from 'pg'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

dotenv.config({ path: '.env.local' })

const PG_URL = process.env.DATABASE_URL
const MODAL_API_KEY = process.env.MODAL_API_KEY
const BACKFILL_URL = (process.env.MODAL_ENDPOINT_URL ?? '').replace(/embed/, 'backfill')
if (!PG_URL) throw new Error('DATABASE_URL missing')
if (!MODAL_API_KEY) throw new Error('MODAL_API_KEY missing')
if (!BACKFILL_URL || !BACKFILL_URL.includes('backfill')) {
  throw new Error('Cannot derive backfill URL from MODAL_ENDPOINT_URL')
}

const BATCH_SIZE = 5
const SLEEP_BETWEEN_BATCHES_MS = 5_000
const PER_REQUEST_TIMEOUT_MS = 10 * 60 * 1000  // 10 min per batch
const MAX_WALL_CLOCK_HOURS = 4
const MAX_FAIL_RATE = 0.20

const STOP_FILE = '/tmp/STOP_BACKFILL'

function shouldStop(): { halt: boolean; reason: string } {
  if (fs.existsSync(STOP_FILE)) {
    return { halt: true, reason: 'STOP_BACKFILL kill-switch present' }
  }
  return { halt: false, reason: '' }
}

interface DocRow {
  id: string
  organization_id: string
  file_name: string | null
  page_count: number | null
}

async function fetchDocs(client: Client): Promise<DocRow[]> {
  const r = await client.query(`
    SELECT d.id, d.organization_id, d.file_name, d.page_count
    FROM documents d
    WHERE d.file_path IS NOT NULL
      AND d.deleted_at IS NULL
      AND d.id NOT IN (
        SELECT DISTINCT source_document_id
        FROM vision_pages
        WHERE source_document_id IS NOT NULL
          AND status = 'indexed'
      )
    ORDER BY d.page_count ASC NULLS LAST, d.file_size_bytes ASC NULLS LAST;
  `)
  return r.rows as DocRow[]
}

async function callBackfill(orgId: string, docIds: string[]): Promise<{
  pagesProcessed: number
  pagesFailed: number
  errors: string[]
  perDoc: Array<{ source_document_id: string; pages_processed: number; pages_failed: number; errors: string[] }>
}> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), PER_REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(BACKFILL_URL, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${MODAL_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ source_document_ids: docIds, organization_id: orgId }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    const json = await res.json() as any
    const docs = (json.document_results ?? []) as Array<{
      source_document_id: string
      pages_processed: number
      pages_failed: number
      errors: string[]
    }>
    const pagesProcessed = docs.reduce((s, d) => s + (d.pages_processed ?? 0), 0)
    const pagesFailed = docs.reduce((s, d) => s + (d.pages_failed ?? 0), 0)
    const errors = docs.flatMap((d) => d.errors)
    return { pagesProcessed, pagesFailed, errors, perDoc: docs }
  } finally {
    clearTimeout(t)
  }
}

function fmt(d: Date): string {
  return d.toISOString().slice(11, 19)
}

async function main() {
  const startedAt = Date.now()
  const client = new Client({ connectionString: PG_URL })
  await client.connect()

  const allDocs = await fetchDocs(client)
  console.log(`[${fmt(new Date())}] Found ${allDocs.length} documents needing backfill`)

  // Group by org to keep each Modal /backfill call single-tenant.
  const byOrg = new Map<string, DocRow[]>()
  for (const d of allDocs) {
    const list = byOrg.get(d.organization_id) ?? []
    list.push(d)
    byOrg.set(d.organization_id, list)
  }
  console.log(`[${fmt(new Date())}] Spread across ${byOrg.size} org(s)`)

  let totalProcessed = 0
  let totalFailed = 0
  let batchNum = 0
  const totalBatches = Array.from(byOrg.values()).reduce(
    (s, list) => s + Math.ceil(list.length / BATCH_SIZE),
    0,
  )

  outer: for (const [orgId, docs] of byOrg.entries()) {
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const stop = shouldStop()
      if (stop.halt) {
        console.log(`[${fmt(new Date())}] HALT: ${stop.reason}`)
        break outer
      }

      const elapsedHours = (Date.now() - startedAt) / 3_600_000
      if (elapsedHours > MAX_WALL_CLOCK_HOURS) {
        console.log(`[${fmt(new Date())}] HALT: wall-clock cap (${elapsedHours.toFixed(2)}h > ${MAX_WALL_CLOCK_HOURS}h)`)
        break outer
      }

      const batch = docs.slice(i, i + BATCH_SIZE)
      const docIds = batch.map((d) => d.id)
      batchNum += 1
      const t0 = Date.now()
      console.log(`[${fmt(new Date())}] Batch ${batchNum}/${totalBatches} (org ${orgId.slice(0,8)} docs ${i+1}-${i+batch.length}/${docs.length})...`)

      try {
        const r = await callBackfill(orgId, docIds)
        totalProcessed += r.pagesProcessed
        totalFailed += r.pagesFailed
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
        console.log(
          `  → ${r.pagesProcessed} pages indexed, ${r.pagesFailed} failed, ${elapsed}s` +
            (r.errors.length ? ` | first error: ${r.errors[0].slice(0, 120)}` : ''),
        )
        // Per-doc summary (compact)
        for (const d of r.perDoc) {
          if (d.pages_failed > 0 || d.errors.length > 0) {
            console.log(`    ⚠  doc ${d.source_document_id.slice(0,8)}: ${d.pages_failed} failed | ${d.errors[0]?.slice(0,100) ?? ''}`)
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.log(`  ✗ batch failed: ${message}`)
        totalFailed += batch.length // worst case — count whole batch as failed
      }

      const failRate = (totalProcessed + totalFailed) > 0
        ? totalFailed / (totalProcessed + totalFailed)
        : 0
      console.log(
        `  cumulative: ${totalProcessed} indexed, ${totalFailed} failed (${(failRate*100).toFixed(1)}% fail rate)`,
      )
      if (failRate > MAX_FAIL_RATE && (totalProcessed + totalFailed) > 30) {
        console.log(`[${fmt(new Date())}] HALT: fail rate ${(failRate*100).toFixed(1)}% > cap ${MAX_FAIL_RATE*100}%`)
        break outer
      }

      await new Promise((r) => setTimeout(r, SLEEP_BETWEEN_BATCHES_MS))
    }
  }

  await client.end()

  const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(1)
  console.log('')
  console.log('==================================================')
  console.log(`[${fmt(new Date())}] Backfill complete`)
  console.log(`  Total batches: ${batchNum}/${totalBatches}`)
  console.log(`  Total pages indexed: ${totalProcessed}`)
  console.log(`  Total pages failed: ${totalFailed}`)
  console.log(`  Elapsed: ${elapsedMin} min`)
}

main().catch((e) => { console.error(e); process.exit(1) })
