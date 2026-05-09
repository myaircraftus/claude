/**
 * Apply migration 104 — ingestion_progress timeline (Phase 13.3).
 *
 * Run from apps/web/:
 *   npx tsx scripts/apply-104.ts
 *
 * After success: delete this file (one-shot convention).
 */
import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const repoRoot = path.resolve(process.cwd(), '..', '..')
const migrationDir = path.join(repoRoot, 'supabase', 'migrations')

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing in apps/web/.env.local')

const client = new Client({ connectionString: url })

async function main() {
  await client.connect()
  const m104 = fs.readFileSync(path.join(migrationDir, '104_ingestion_progress.sql'), 'utf8')

  console.log('Applying 104_ingestion_progress.sql ...')
  try {
    await client.query(m104)
    console.log('  OK')
  } catch (e) {
    console.error('FAILED:', e)
    process.exit(1)
  }

  // Verification 1: table + columns
  const cols = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ingestion_progress'
    ORDER BY ordinal_position;
  `)
  console.log('\ningestion_progress columns:')
  console.table(cols.rows)
  if (cols.rows.length < 8) {
    console.error('FAIL: too few columns')
    process.exit(1)
  }

  // Verification 2: indexes
  const idx = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'ingestion_progress'
      AND indexname LIKE 'idx_ingestion_progress_%'
    ORDER BY indexname;
  `)
  console.log('\nIndexes (expect ≥3):')
  console.table(idx.rows)
  if (idx.rows.length < 3) {
    console.error('FAIL: missing indexes')
    process.exit(1)
  }

  // Verification 3: triggers
  const trg = await client.query(`
    SELECT tgname FROM pg_trigger
    WHERE tgname IN (
      'trg_emit_ingestion_progress_uploaded',
      'trg_emit_ingestion_progress_status_change',
      'trg_emit_ingestion_progress_vision_pages',
      'trg_touch_ingestion_progress_updated_at'
    )
    ORDER BY tgname;
  `)
  console.log('\nTriggers (expect 4):')
  console.table(trg.rows)
  if (trg.rows.length !== 4) {
    console.error(`FAIL: expected 4 triggers, got ${trg.rows.length}`)
    process.exit(1)
  }

  // Verification 4: RLS enabled + select policy
  const rls = await client.query(`
    SELECT relname, relrowsecurity FROM pg_class
    WHERE relname = 'ingestion_progress' AND relkind = 'r';
  `)
  console.log('\nRLS state:')
  console.table(rls.rows)
  if (!rls.rows[0]?.relrowsecurity) {
    console.error('FAIL: RLS not enabled')
    process.exit(1)
  }

  await client.end()
  console.log('\n✅ migration 104 applied + verified')
}

main().catch(async (err) => {
  console.error(err)
  try {
    await client.end()
  } catch {}
  process.exit(1)
})
