/** Delete vision_pages with status='embedding' older than 1h — stuck mid-flight. */
import { Client } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const c = new Client({ connectionString: process.env.DATABASE_URL })
;(async () => {
  await c.connect()
  const before = await c.query(`SELECT COUNT(*)::int AS n FROM vision_pages WHERE status='embedding' AND updated_at < now() - interval '1 hour'`)
  console.log(`Stuck (>1h old) embedding rows: ${before.rows[0]?.n}`)

  const del = await c.query(`
    DELETE FROM vision_pages
    WHERE status = 'embedding'
      AND updated_at < now() - interval '1 hour'
    RETURNING id, source_document_id, page_number
  `)
  console.log(`Deleted ${del.rows.length} stuck rows`)
  console.log('First 5 deleted:')
  console.table(del.rows.slice(0, 5))

  // Confirm post-state
  const after = await c.query(`
    SELECT status, COUNT(*)::int AS n FROM vision_pages GROUP BY status ORDER BY n DESC
  `)
  console.log('\nPost-cleanup:')
  console.table(after.rows)

  await c.end()
})().catch((e) => { console.error(e); process.exit(1) })
