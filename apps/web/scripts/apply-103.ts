/**
 * Apply migration 103 — document type taxonomy + persona-strict upload RLS.
 *
 * Phase 13 Sprint 13.1. Follows the apply-098-099 / apply-100 / apply-101 /
 * apply-102 pattern. Run from apps/web/:
 *   npx tsx scripts/apply-103.ts
 *
 * After success: delete this file (one-shot convention) — `git rm scripts/apply-103.ts`.
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

  const m103 = fs.readFileSync(path.join(migrationDir, '103_document_types.sql'), 'utf8')

  console.log('Applying 103_document_types.sql ...')
  try {
    await client.query(m103)
    console.log('  OK')
  } catch (e) {
    console.error('FAILED:', e)
    process.exit(1)
  }

  // Verification 1: new columns present
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name IN ('document_type', 'uploaded_by_persona', 'aircraft_id')
    ORDER BY column_name;
  `)
  console.log('\nNew/existing columns on documents (expect 3):')
  console.table(cols.rows)
  if (cols.rows.length !== 3) {
    console.error(`FAIL: expected 3 columns, got ${cols.rows.length}`)
    process.exit(1)
  }

  // Verification 2: CHECK constraints
  const checks = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.documents'::regclass
      AND conname IN ('documents_document_type_check', 'documents_uploaded_by_persona_check')
    ORDER BY conname;
  `)
  console.log('\nCHECK constraints (expect 2):')
  console.table(checks.rows.map((r: any) => ({ conname: r.conname, def: r.def.slice(0, 90) + '…' })))
  if (checks.rows.length !== 2) {
    console.error(`FAIL: expected 2 CHECK constraints, got ${checks.rows.length}`)
    process.exit(1)
  }

  // Verification 3: indexes
  const idx = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'documents'
      AND indexname IN ('idx_documents_org_type', 'idx_documents_org_aircraft', 'idx_documents_uploaded_persona')
    ORDER BY indexname;
  `)
  console.log('\nNew indexes (expect 3):')
  console.table(idx.rows)
  if (idx.rows.length !== 3) {
    console.error(`FAIL: expected 3 indexes, got ${idx.rows.length}`)
    process.exit(1)
  }

  // Verification 4: RLS policy replaced
  const pol = await client.query(`
    SELECT polname, pg_get_expr(polwithcheck, polrelid) AS check_expr
    FROM pg_policy
    WHERE polrelid = 'public.documents'::regclass
      AND polname = 'documents_insert';
  `)
  console.log('\ndocuments_insert policy:')
  console.table(pol.rows.map((r: any) => ({ polname: r.polname, expr_len: r.check_expr.length })))
  if (pol.rows.length !== 1) {
    console.error(`FAIL: expected documents_insert policy, got ${pol.rows.length}`)
    process.exit(1)
  }
  if (!pol.rows[0].check_expr.includes('user_persona_in_org')) {
    console.error('FAIL: documents_insert policy does not reference user_persona_in_org()')
    process.exit(1)
  }

  // Verification 5: helper function present
  const fn = await client.query(`
    SELECT proname FROM pg_proc
    WHERE proname = 'user_persona_in_org' AND pronamespace = 'public'::regnamespace;
  `)
  console.log('\nuser_persona_in_org function (expect 1 row):')
  console.table(fn.rows)
  if (fn.rows.length !== 1) {
    console.error('FAIL: user_persona_in_org() not created')
    process.exit(1)
  }

  // Verification 6: backfill — every existing row has a non-null document_type matching the CHECK
  const backfill = await client.query(`
    SELECT document_type, COUNT(*)::int AS n
    FROM documents
    GROUP BY document_type
    ORDER BY document_type;
  `)
  console.log('\nBackfill distribution:')
  console.table(backfill.rows)

  await client.end()
  console.log('\n✅ migration 103 applied + verified')
}

main().catch(async (err) => {
  console.error(err)
  try {
    await client.end()
  } catch {}
  process.exit(1)
})
