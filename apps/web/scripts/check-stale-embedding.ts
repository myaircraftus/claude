/** Check freshness of 'embedding' status rows. */
import { Client } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const c = new Client({ connectionString: process.env.DATABASE_URL })
;(async () => {
  await c.connect()
  const r = await c.query(`
    SELECT
      MAX(updated_at) AS newest,
      MIN(updated_at) AS oldest,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE updated_at > now() - interval '5 minutes')::int AS fresh_5min,
      COUNT(*) FILTER (WHERE updated_at > now() - interval '1 hour')::int AS fresh_1h,
      COUNT(*) FILTER (WHERE updated_at < now() - interval '1 hour')::int AS stale_over_1h
    FROM vision_pages
    WHERE status = 'embedding'
  `)
  console.log('embedding status freshness:')
  console.table(r.rows)
  await c.end()
})()
