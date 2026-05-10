/**
 * One-shot smoke test for the Phase 12 architecture-gap fix.
 *
 * Picks a small document that doesn't have indexed vision_pages yet,
 * creates a vision_index_job with placeholder vision_pages (auto-
 * dispatch shape), pushes created_at back 11 minutes so the cron
 * considers it stuck, then invokes the cron directly via fetch and
 * verifies the response.
 *
 * Usage:
 *   cd apps/web
 *   npx tsx scripts/smoke-modal-backfill.ts
 *
 * Cleanup runs at the end (or on abort).
 */
import { Client } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL
const CRON_SECRET = process.env.CRON_SECRET
const APP_BASE = process.env.SMOKE_APP_BASE ?? 'https://www.myaircraft.us'

if (!DATABASE_URL) throw new Error('DATABASE_URL missing')
if (!CRON_SECRET) throw new Error('CRON_SECRET missing in apps/web/.env.local')

const c = new Client({ connectionString: DATABASE_URL })

async function main() {
  await c.connect()

  // 1. Pick a small doc (≤ 5 pages) that has no indexed vision_pages
  const candRes = await c.query(`
    SELECT d.id, d.organization_id, d.file_path, d.page_count, d.title, d.file_name
    FROM documents d
    WHERE d.page_count BETWEEN 1 AND 5
      AND d.file_path IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM vision_pages vp
        WHERE vp.source_document_id = d.id
          AND vp.status = 'indexed'
      )
    ORDER BY d.page_count ASC
    LIMIT 1
  `)
  if (candRes.rows.length === 0) {
    console.log('No suitable test doc found. Falling back to ANY small doc.')
    process.exit(1)
  }
  const doc = candRes.rows[0]
  console.log(`Test doc: ${doc.id} (${doc.page_count} pages, ${doc.file_name?.slice(0, 50)})`)

  // Track ids for cleanup
  const cleanupPageIds: string[] = []
  let cleanupJobId: string | null = null

  try {
    // 2. Create placeholder vision_pages (auto-dispatch shape)
    await c.query('BEGIN')
    const pageRows: { id: string }[] = []
    for (let n = 0; n < doc.page_count; n++) {
      const ins = await c.query(
        `
        INSERT INTO vision_pages (organization_id, source_document_id, page_number, page_image_path, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING id
        `,
        [doc.organization_id, doc.id, n, `${doc.organization_id}/${doc.id}/page_${n}.png`],
      )
      pageRows.push(ins.rows[0])
      cleanupPageIds.push(ins.rows[0].id)
    }

    // 3. Create vision_index_job with created_at 11 min ago
    const jobRes = await c.query(
      `
      INSERT INTO vision_index_jobs (organization_id, vision_page_ids, status, created_at)
      VALUES ($1, $2, 'queued', NOW() - INTERVAL '11 minutes')
      RETURNING id
      `,
      [doc.organization_id, pageRows.map((p) => p.id)],
    )
    const jobId = jobRes.rows[0].id as string
    cleanupJobId = jobId
    console.log(`Created stuck job: ${jobId}`)
    await c.query('COMMIT')

    // 4. Manually invoke the cron via HTTPS
    console.log(`\nCalling ${APP_BASE}/api/cron/vision-fallback-sweep ...`)
    const cronRes = await fetch(`${APP_BASE}/api/cron/vision-fallback-sweep`, {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const cronBody = await cronRes.json()
    console.log('Cron response:', JSON.stringify(cronBody, null, 2))

    if (!cronRes.ok) {
      throw new Error(`Cron returned ${cronRes.status}`)
    }

    // 5. Wait + poll for completion (up to 5 min)
    console.log(`\nPolling job ${jobId} for completion (max 5 min)...`)
    const deadline = Date.now() + 5 * 60_000
    let finalStatus = 'queued'
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10_000))
      const jr = await c.query(
        `SELECT status, gpu_host, error_message, metadata FROM vision_index_jobs WHERE id = $1`,
        [jobId],
      )
      const row = jr.rows[0]
      finalStatus = row.status
      console.log(`  status=${row.status} gpu_host=${row.gpu_host ?? '(null)'} ${row.error_message ? `err=${row.error_message.slice(0, 80)}` : ''}`)
      if (row.status === 'completed' || row.status === 'failed') break
    }

    // 6. Verify final state
    if (finalStatus !== 'completed') {
      console.log(`\n❌ Job did not reach 'completed' (final=${finalStatus})`)
    } else {
      console.log(`\n✅ Job reached 'completed'`)
    }

    // Inspect the resulting vision_pages
    const pagesAfter = await c.query(
      `
      SELECT id, page_number, page_image_path, status, vision_index_id
      FROM vision_pages
      WHERE source_document_id = $1
      ORDER BY page_number
      `,
      [doc.id],
    )
    console.log(`\nvision_pages for ${doc.id}:`)
    console.table(
      pagesAfter.rows.map((r: any) => ({
        page_number: r.page_number,
        status: r.status,
        path: r.page_image_path?.slice(0, 60),
        has_vision_index_id: r.vision_index_id != null,
      })),
    )

    // Capture the FRESH page IDs created by /backfill so cleanup gets them
    for (const r of pagesAfter.rows) {
      if (!cleanupPageIds.includes(r.id)) cleanupPageIds.push(r.id)
    }

    const embCount = await c.query(
      `SELECT COUNT(*)::int AS n FROM vision_embeddings vp WHERE vp.vision_page_id IN (
        SELECT id FROM vision_pages WHERE source_document_id = $1
      )`,
      [doc.id],
    )
    console.log(`vision_embeddings for this doc: ${embCount.rows[0].n}`)

    const allIndexed = pagesAfter.rows.every((r: any) => r.status === 'indexed')
    console.log(allIndexed ? '✅ All pages indexed' : '⚠ Not all pages indexed')
  } finally {
    // Cleanup
    console.log('\nCleaning up test rows...')
    if (cleanupJobId) {
      await c.query(`DELETE FROM vision_index_jobs WHERE id = $1`, [cleanupJobId])
    }
    if (cleanupPageIds.length > 0) {
      const emb = await c.query(
        `DELETE FROM vision_embeddings WHERE vision_page_id = ANY($1::uuid[]) RETURNING vision_page_id`,
        [cleanupPageIds],
      )
      const pgs = await c.query(
        `DELETE FROM vision_pages WHERE id = ANY($1::uuid[]) RETURNING id`,
        [cleanupPageIds],
      )
      console.log(`  deleted ${emb.rowCount ?? 0} embeddings, ${pgs.rowCount ?? 0} pages, 1 job`)
    }
    await c.end()
  }
}

main().catch(async (e) => {
  console.error(e)
  try { await c.end() } catch {}
  process.exit(1)
})
