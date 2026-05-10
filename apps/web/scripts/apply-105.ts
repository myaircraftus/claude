/**
 * Apply migration 105 — Phase 14 billing tiers (Beta/Standard/Pro).
 *
 * Run from apps/web/:
 *   npx tsx scripts/apply-105.ts
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
  const sql = fs.readFileSync(path.join(migrationDir, '105_billing_tiers.sql'), 'utf8')

  console.log('Applying 105_billing_tiers.sql ...')
  try {
    await client.query(sql)
    console.log('  OK')
  } catch (e) {
    console.error('FAILED:', e)
    process.exit(1)
  }

  // Verify columns
  const cols = await client.query(`
    SELECT table_name, column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'organizations' AND column_name IN ('tier','tier_effective_from','tier_billing_disabled'))
        OR (table_name = 'aircraft' AND column_name = 'tier_override')
      )
    ORDER BY table_name, column_name
  `)
  console.log('\nNew columns (expect 4):')
  console.table(cols.rows)
  if (cols.rows.length !== 4) {
    console.error(`FAIL: expected 4 columns, got ${cols.rows.length}`)
    process.exit(1)
  }

  // Verify CHECK constraints
  const checks = await client.query(`
    SELECT conname FROM pg_constraint
    WHERE conname IN (
      'organizations_tier_check',
      'aircraft_tier_override_check',
      'tier_history_to_tier_check',
      'tier_history_from_tier_check'
    )
    ORDER BY conname
  `)
  console.log('\nCHECK constraints (expect 4):')
  console.table(checks.rows)
  if (checks.rows.length !== 4) {
    console.error('FAIL: missing CHECK constraints')
    process.exit(1)
  }

  // Verify tier_history table + indexes
  const tbl = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tier_history'
    ORDER BY ordinal_position
  `)
  console.log('\ntier_history columns:')
  console.table(tbl.rows)

  // Verify backfill: every existing org has tier='beta'
  const tierDist = await client.query(`SELECT tier, COUNT(*)::int AS n FROM organizations GROUP BY tier ORDER BY tier`)
  console.log('\norganizations.tier distribution:')
  console.table(tierDist.rows)

  await client.end()
  console.log('\n✅ migration 105 applied + verified')
}

main().catch(async (err) => {
  console.error(err)
  try { await client.end() } catch {}
  process.exit(1)
})
