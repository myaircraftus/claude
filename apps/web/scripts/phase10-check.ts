/** Phase 10 progress check — has Colab backfill landed? */
import { Client } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const c = new Client({ connectionString: process.env.DATABASE_URL })
;(async () => {
  await c.connect()
  const status = await c.query(`SELECT status, COUNT(*)::int AS n FROM vision_pages WHERE deleted_at IS NULL GROUP BY status ORDER BY status`)
  console.log('vision_pages:'); console.table(status.rows)
  const docs = await c.query(`SELECT COUNT(DISTINCT source_document_id)::int AS n FROM vision_pages WHERE status='indexed' AND deleted_at IS NULL`)
  const total = await c.query(`SELECT COUNT(*)::int AS n FROM documents WHERE file_path IS NOT NULL AND deleted_at IS NULL`)
  console.log(`Indexed docs: ${docs.rows[0]?.n} / ${total.rows[0]?.n}`)
  const recent = await c.query(`SELECT created_at, COUNT(*)::int AS n FROM vision_pages WHERE status='indexed' AND created_at > now() - interval '4 hours' GROUP BY date_trunc('minute', created_at), created_at ORDER BY created_at DESC LIMIT 10`)
  console.log('Recent indexed (last 4h):'); console.table(recent.rows.map((r: any) => ({ ts: r.created_at?.toISOString?.()?.slice(11,19), n: r.n })))
  const embeds = await c.query(`SELECT COUNT(*)::int AS n FROM vision_embeddings`)
  console.log(`vision_embeddings: ${embeds.rows[0]?.n}`)
  await c.end()
})().catch((e) => { console.error(e); process.exit(1) })
