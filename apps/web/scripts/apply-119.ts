// Phase 18 Sprint 18.1 — apply migration 119_merge_mechanic_into_shop.sql.
//
//   cd apps/web && pnpm dlx tsx scripts/apply-119.ts
//
// Behavior:
//   - Counts pre-migration mechanic rows in organization_memberships,
//     user_profiles, documents (for the report).
//   - Wraps the SQL in BEGIN / COMMIT.
//   - Verifies post-apply:
//       * 0 mechanic rows remain in any of the 3 tables
//       * CHECK constraints exclude 'mechanic'
//       * documents_insert policy no longer branches on mechanic
//   - Rolls back on any error.

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

  // Pre-migration counts.
  const preMem = await client.query(`
    SELECT persona, count(*)::int AS n FROM organization_memberships
    GROUP BY persona ORDER BY persona NULLS LAST;
  `)
  console.log('\nPRE — organization_memberships by persona:')
  console.table(preMem.rows)

  const preProf = await client.query(`
    SELECT persona, count(*)::int AS n FROM user_profiles
    GROUP BY persona ORDER BY persona NULLS LAST;
  `)
  console.log('\nPRE — user_profiles by persona:')
  console.table(preProf.rows)

  const preDocs = await client.query(`
    SELECT uploaded_by_persona, count(*)::int AS n FROM documents
    GROUP BY uploaded_by_persona ORDER BY uploaded_by_persona;
  `)
  console.log('\nPRE — documents by uploaded_by_persona:')
  console.table(preDocs.rows)

  const preEnt = await client.query(`
    SELECT persona, count(*)::int AS n FROM entitlements
    GROUP BY persona ORDER BY persona NULLS LAST;
  `)
  console.log('\nPRE — entitlements by persona:')
  console.table(preEnt.rows)

  // Apply the migration.
  const m119 = fs.readFileSync(path.join(migrationDir, '119_merge_mechanic_into_shop.sql'), 'utf8')

  await client.query('BEGIN')
  try {
    console.log('\nApplying 119_merge_mechanic_into_shop.sql ...')
    await client.query(m119)
    console.log('  OK')
    await client.query('COMMIT')
    console.log('COMMIT — migration 119 applied')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('ROLLBACK:', e)
    process.exit(1)
  }

  // Post-migration verifications.
  const postMem = await client.query(`
    SELECT persona, count(*)::int AS n FROM organization_memberships
    GROUP BY persona ORDER BY persona NULLS LAST;
  `)
  console.log('\nPOST — organization_memberships by persona:')
  console.table(postMem.rows)

  const postProf = await client.query(`
    SELECT persona, count(*)::int AS n FROM user_profiles
    GROUP BY persona ORDER BY persona NULLS LAST;
  `)
  console.log('\nPOST — user_profiles by persona:')
  console.table(postProf.rows)

  const postDocs = await client.query(`
    SELECT uploaded_by_persona, count(*)::int AS n FROM documents
    GROUP BY uploaded_by_persona ORDER BY uploaded_by_persona;
  `)
  console.log('\nPOST — documents by uploaded_by_persona:')
  console.table(postDocs.rows)

  const postEnt = await client.query(`
    SELECT persona, count(*)::int AS n FROM entitlements
    GROUP BY persona ORDER BY persona NULLS LAST;
  `)
  console.log('\nPOST — entitlements by persona:')
  console.table(postEnt.rows)

  // Sanity: zero mechanic rows everywhere.
  const lingering =
    postMem.rows.some((r: any) => r.persona === 'mechanic') ||
    postProf.rows.some((r: any) => r.persona === 'mechanic') ||
    postDocs.rows.some((r: any) => r.uploaded_by_persona === 'mechanic') ||
    postEnt.rows.some((r: any) => r.persona === 'mechanic')
  if (lingering) {
    console.error('FAIL: mechanic rows still present somewhere')
    process.exit(1)
  }
  console.log('\n✓ zero mechanic rows remain across memberships, profiles, documents')

  // CHECK constraint verification.
  const checks = await client.query(`
    SELECT conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.contype = 'c'
      AND conname IN (
        'user_profiles_persona_check',
        'organization_memberships_persona_check',
        'documents_uploaded_by_persona_check',
        'entitlements_persona_check'
      )
    ORDER BY conname;
  `)
  console.log('\nCHECK constraints (must NOT contain "mechanic"):')
  console.table(checks.rows)
  for (const c of checks.rows as Array<{ conname: string; def: string }>) {
    if (c.def.includes("'mechanic'")) {
      console.error(`FAIL: ${c.conname} still references 'mechanic'`)
      process.exit(1)
    }
  }
  console.log('✓ no CHECK constraint references mechanic anymore')

  // Policy verification.
  const policy = await client.query(`
    SELECT pg_get_expr(p.polqual, p.polrelid)
           || ' :: WITH CHECK '
           || pg_get_expr(p.polwithcheck, p.polrelid) AS body
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'documents' AND p.polname = 'documents_insert';
  `)
  const policyBody = policy.rows[0]?.body ?? ''
  console.log('\ndocuments_insert policy body length:', policyBody.length)
  if (/WHEN 'mechanic' THEN/i.test(policyBody)) {
    console.error('FAIL: documents_insert policy still branches on mechanic')
    process.exit(1)
  }
  console.log('✓ documents_insert policy no longer branches on mechanic')

  await client.end()
  console.log('\n✅ migration 119 applied + verified — persona model collapsed to 3 (owner/shop/admin)')
}

main().catch((e) => { console.error(e); process.exit(1) })
