/**
 * Apply migration 106 — Phase 14 vision_index_jobs.scheduled_for column.
 *
 * Run from apps/web/:
 *   npx tsx scripts/apply-106.ts
 *
 * Delete after success per the one-shot convention.
 */
import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const repoRoot = path.resolve(process.cwd(), '..', '..')
const migrationDir = path.join(repoRoot, 'supabase', 'migrations')

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing')

const client = new Client({ connectionString: url })

async function main() {
  await client.connect()
  const sql = fs.readFileSync(path.join(migrationDir, '106_vision_jobs_scheduled_for.sql'), 'utf8')

  console.log('Applying 106_vision_jobs_scheduled_for.sql ...')
  try {
    await client.query(sql)
    console.log('  OK')
  } catch (e) {
    console.error('FAILED:', e)
    process.exit(1)
  }

  // Verify column
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vision_index_jobs'
      AND column_name = 'scheduled_for'
  `)
  console.log('\nscheduled_for column:')
  console.table(cols.rows)
  if (cols.rows.length !== 1) {
    console.error('FAIL: scheduled_for column not present')
    process.exit(1)
  }

  // Verify partial index
  const idx = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'vision_index_jobs'
      AND indexname = 'idx_vision_jobs_queued_scheduled'
  `)
  console.log('\nIndex (expect 1):')
  console.table(idx.rows)
  if (idx.rows.length !== 1) {
    console.error('FAIL: index missing')
    process.exit(1)
  }

  // Sanity: backfilled all existing rows
  const nullCheck = await client.query(`SELECT COUNT(*)::int AS n FROM vision_index_jobs WHERE scheduled_for IS NULL`)
  console.log(`\nRows with NULL scheduled_for (expect 0): ${nullCheck.rows[0].n}`)
  if (nullCheck.rows[0].n !== 0) {
    console.error('FAIL: backfill incomplete')
    process.exit(1)
  }

  await client.end()
  console.log('\n✅ migration 106 applied + verified')
}

main().catch(async (err) => {
  console.error(err)
  try { await client.end() } catch {}
  process.exit(1)
})
