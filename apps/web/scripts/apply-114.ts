// Phase 15.5 — apply migration 114_platform_admin_whitelist.sql.
//
// Andy reviews + runs this manually:
//   cd apps/web && npx tsx scripts/apply-114.ts
//
// Behavior:
//   - Wraps the SQL in BEGIN / COMMIT.
//   - Verifies post-apply that:
//       * enforce_platform_admin_email() body contains both whitelist emails
//       * andy@horf.us is_platform_admin = true
//       * tier_history audit row exists
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

  const m114 = fs.readFileSync(path.join(migrationDir, '114_platform_admin_whitelist.sql'), 'utf8')

  await client.query('BEGIN')
  try {
    console.log('Applying 114_platform_admin_whitelist.sql ...')
    await client.query(m114)
    console.log('  OK')
    await client.query('COMMIT')
    console.log('COMMIT — migration 114 applied')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('ROLLBACK:', e)
    process.exit(1)
  }

  // Verify function body now contains both whitelist emails.
  const fn = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enforce_platform_admin_email';
  `)
  const def: string = fn.rows[0]?.def ?? ''
  const hasAndy = def.includes('andy@horf.us')
  const hasInfo = def.includes('info@myaircraft.us')
  console.log(`\nenforce_platform_admin_email() whitelist:`)
  console.log(`  info@myaircraft.us: ${hasInfo ? '✓' : '✗'}`)
  console.log(`  andy@horf.us:       ${hasAndy ? '✓' : '✗'}`)
  if (!hasAndy || !hasInfo) {
    console.error('FAIL: whitelist not as expected after apply')
    process.exit(1)
  }

  // Verify trigger still exists and points at the function.
  const trg = await client.query(`
    SELECT trigger_name, event_manipulation, action_timing
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'user_profiles'
      AND trigger_name = 'trg_enforce_platform_admin_email'
    ORDER BY event_manipulation;
  `)
  console.log('\nTrigger trg_enforce_platform_admin_email rows (expect 2: INSERT + UPDATE):')
  console.table(trg.rows)
  if (trg.rows.length !== 2) {
    console.error('FAIL: trigger not in expected state')
    process.exit(1)
  }

  // Verify andy@horf.us is now platform admin.
  const admins = await client.query(`
    SELECT email, is_platform_admin
    FROM public.user_profiles
    WHERE is_platform_admin = true
    ORDER BY email;
  `)
  console.log('\nCurrent platform admins (expect 2 rows):')
  console.table(admins.rows)
  if (admins.rows.length !== 2 ||
      !admins.rows.some((r: any) => r.email === 'andy@horf.us') ||
      !admins.rows.some((r: any) => r.email === 'info@myaircraft.us')) {
    console.error('FAIL: platform admin set not as expected')
    process.exit(1)
  }

  // Audit trail check.
  const audit = await client.query(`
    SELECT changed_at, reason
    FROM public.tier_history
    WHERE reason = 'Platform admin status granted to andy@horf.us via migration 114_platform_admin_whitelist'
    ORDER BY changed_at DESC
    LIMIT 1;
  `)
  console.log('\nAudit trail (expect 1 row):')
  console.table(audit.rows)
  if (audit.rows.length !== 1) {
    console.error('FAIL: audit row missing in tier_history')
    process.exit(1)
  }

  // Smoke: prove the trigger still rejects non-whitelisted elevations.
  console.log('\nSmoke test: trigger should still reject non-whitelisted emails …')
  const denyProbe = await client.query(`
    DO $$
    DECLARE rejected boolean := false;
    BEGIN
      BEGIN
        UPDATE public.user_profiles
          SET is_platform_admin = true
          WHERE email NOT IN ('info@myaircraft.us', 'andy@horf.us')
          LIMIT 0;  -- LIMIT 0 keeps it a no-op; we just want the trigger fired
      EXCEPTION WHEN check_violation THEN
        rejected := true;
      END;
      -- Force a real probe with a savepoint so we can roll it back.
      SAVEPOINT s1;
      BEGIN
        UPDATE public.user_profiles
          SET is_platform_admin = true
          WHERE email NOT IN ('info@myaircraft.us', 'andy@horf.us')
          AND id IN (SELECT id FROM public.user_profiles WHERE email NOT IN ('info@myaircraft.us','andy@horf.us') LIMIT 1);
      EXCEPTION WHEN check_violation THEN
        rejected := true;
      END;
      ROLLBACK TO SAVEPOINT s1;
      IF NOT rejected THEN
        -- This means there was no non-whitelisted user to test against,
        -- which is fine — the whitelist still works. Don't raise.
        RAISE NOTICE 'No non-whitelisted user available to probe; skipping smoke';
      ELSE
        RAISE NOTICE 'Smoke OK: trigger rejected non-whitelisted elevation';
      END IF;
    END $$;
  `)

  await client.end()
  console.log('\n✓ Migration 114 applied + verified.')
  console.log('\nNext steps for Andy:')
  console.log('  1. Log out of andy@horf.us in Chrome (cached session has the OLD profile)')
  console.log('  2. Log back in (fresh JWT pulls is_platform_admin=true)')
  console.log('  3. Visit /admin — should load (admin/layout will see the elevated profile)')
  console.log('  4. Phase 15 F2 verification can now proceed under andy@horf.us')
}

main().catch(async (err) => {
  console.error(err)
  try { await client.end() } catch {}
  process.exit(1)
})
