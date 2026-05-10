/**
 * Apply migration 108 — Phase 14 document_review_requests workflow table.
 *
 * Run from apps/web/:
 *   npx tsx scripts/apply-108.ts
 *
 * Delete after success per the one-shot convention.
 */
import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const repoRoot = path.resolve(process.cwd(), '..', '..')
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing')
const client = new Client({ connectionString: url })

async function main() {
  await client.connect()
  const sql = fs.readFileSync(path.join(repoRoot, 'supabase', 'migrations', '108_document_review_requests.sql'), 'utf8')
  console.log('Applying 108_document_review_requests.sql ...')
  try {
    await client.query(sql)
    console.log('  OK')
  } catch (e) {
    console.error('FAILED:', e)
    process.exit(1)
  }

  const tbl = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'document_review_requests'
    ORDER BY ordinal_position
  `)
  console.log('\ndocument_review_requests columns:')
  console.table(tbl.rows)
  if (tbl.rows.length < 14) {
    console.error('FAIL: too few columns')
    process.exit(1)
  }

  const idx = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'document_review_requests'
    ORDER BY indexname
  `)
  console.log('\nIndexes:')
  console.table(idx.rows)

  const rls = await client.query(`
    SELECT relrowsecurity FROM pg_class WHERE relname = 'document_review_requests'
  `)
  console.log('\nRLS enabled:', rls.rows[0]?.relrowsecurity)
  if (!rls.rows[0]?.relrowsecurity) {
    console.error('FAIL: RLS not enabled')
    process.exit(1)
  }
  await client.end()
  console.log('\n✅ migration 108 applied + verified')
}
main().catch(async (err) => {
  console.error(err)
  try { await client.end() } catch {}
  process.exit(1)
})
