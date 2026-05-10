/**
 * Apply migration 107 — Phase 14 documents.handwriting_pct + suggests_review.
 *
 * Run from apps/web/:
 *   npx tsx scripts/apply-107.ts
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
  const sql = fs.readFileSync(path.join(repoRoot, 'supabase', 'migrations', '107_handwriting_pct.sql'), 'utf8')
  console.log('Applying 107_handwriting_pct.sql ...')
  try {
    await client.query(sql)
    console.log('  OK')
  } catch (e) {
    console.error('FAILED:', e)
    process.exit(1)
  }

  const cols = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'documents'
      AND column_name IN ('handwriting_pct', 'suggests_review')
    ORDER BY column_name
  `)
  console.log('\nNew columns (expect 2):')
  console.table(cols.rows)
  if (cols.rows.length !== 2) {
    console.error('FAIL: expected 2 columns')
    process.exit(1)
  }
  await client.end()
  console.log('\n✅ migration 107 applied + verified')
}
main().catch(async (err) => {
  console.error(err)
  try { await client.end() } catch {}
  process.exit(1)
})
