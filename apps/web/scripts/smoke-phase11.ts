/**
 * Phase 11 Sprint 11.6 — end-to-end smoke for Colab/Modal hybrid dispatch.
 *
 * PREREQUISITES (will hard-fail at step 0 if missing):
 *   - Migration 102 applied (vision_worker_heartbeat table exists)
 *   - For Smoke A: Colab queue worker notebook running with heartbeat
 *     ticking inside last 60s
 *   - CRON_SECRET env var set (for Smoke B's manual cron trigger)
 *
 * USAGE:
 *   cd apps/web
 *   # Smoke A: Colab path (worker should be running)
 *   npx tsx scripts/smoke-phase11.ts colab
 *   # Smoke B: Modal fallback (worker should be stopped or stale)
 *   npx tsx scripts/smoke-phase11.ts modal
 *
 * What it does:
 *   - Picks an existing org + finds an indexed vision_pages row to clone
 *   - Inserts a synthetic vision_index_jobs row (status='queued')
 *   - For Smoke A: waits up to 90s for status to flip to 'completed' via Colab
 *   - For Smoke B: hits /api/cron/vision-fallback-sweep manually with cron auth,
 *                  waits up to 5 min for status='completed' via Modal
 *   - Cleans up: deletes synthetic vision_index_jobs row
 *
 * Idempotent: safe to run repeatedly; cleans up after itself.
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET
const VERCEL_BASE = process.env.VERCEL_PROD_BASE ?? 'https://www.myaircraft.us'

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

async function preflight(): Promise<{ orgId: string; visionPageId: string }> {
  // Verify table exists. supabase-js doesn't always set .error for missing
  // tables, so probe via raw pg query for an authoritative answer.
  const { Client } = await import('pg')
  const dburl = process.env.DATABASE_URL
  if (!dburl) throw new Error('DATABASE_URL missing')
  const c = new Client({ connectionString: dburl })
  await c.connect()
  try {
    const r = await c.query("SELECT to_regclass('public.vision_worker_heartbeat') AS exists")
    if (!r.rows[0]?.exists) {
      throw new Error(
        'PREFLIGHT FAIL: vision_worker_heartbeat table not found. ' +
          'Apply migration 102 first: cd apps/web && npx tsx scripts/apply-102.ts',
      )
    }
  } finally {
    await c.end()
  }

  // Get an existing indexed vision_pages row to attach the synthetic job to
  const { data: page } = await sb
    .from('vision_pages')
    .select('id, organization_id')
    .eq('status', 'indexed')
    .limit(1)
    .single()
  if (!page) throw new Error('no indexed vision_pages row to anchor synthetic job against')
  return { orgId: page.organization_id, visionPageId: page.id }
}

async function insertSyntheticJob(orgId: string, pageId: string): Promise<string> {
  const tag = `phase11-smoke-${Date.now()}`
  const { data, error } = await sb
    .from('vision_index_jobs')
    .insert({
      organization_id: orgId,
      vision_page_ids: [pageId],
      status: 'queued',
      metadata: { smoke_tag: tag },
    })
    .select('id')
    .single()
  if (error) throw new Error(`insert synthetic job failed: ${error.message}`)
  return data.id
}

async function waitForCompletion(jobId: string, maxMs: number, expectedHost?: string): Promise<{ status: string; gpu_host: string | null }> {
  const t0 = Date.now()
  while (Date.now() - t0 < maxMs) {
    const { data } = await sb
      .from('vision_index_jobs')
      .select('status, gpu_host, error_message')
      .eq('id', jobId)
      .single()
    if (!data) {
      throw new Error('job vanished')
    }
    if (data.status === 'completed' || data.status === 'failed') {
      return { status: data.status, gpu_host: data.gpu_host }
    }
    process.stdout.write('.')
    await new Promise((r) => setTimeout(r, 5_000))
  }
  process.stdout.write('\n')
  throw new Error(`timeout after ${maxMs}ms; job stayed in non-terminal state`)
}

async function smokeA(): Promise<void> {
  console.log('=== Smoke A: Colab happy path ===')
  const { orgId, visionPageId } = await preflight()

  // Confirm a Colab worker is alive
  const cutoff = new Date(Date.now() - 60_000).toISOString()
  const { data: alive } = await sb
    .from('vision_worker_heartbeat')
    .select('worker_id, gpu_host, status')
    .gte('last_seen_at', cutoff)
    .in('status', ['idle', 'busy'])
  if (!alive || alive.length === 0) {
    throw new Error('No live Colab worker. Start the queue worker notebook first.')
  }
  console.log(`✓ ${alive.length} live worker(s); first: ${alive[0].worker_id} (${alive[0].gpu_host})`)

  const jobId = await insertSyntheticJob(orgId, visionPageId)
  console.log(`✓ Inserted synthetic job ${jobId.slice(0, 8)}; waiting up to 90s...`)

  try {
    const result = await waitForCompletion(jobId, 90_000)
    console.log(`\n  job.status = ${result.status}, gpu_host = ${result.gpu_host}`)
    if (result.status === 'completed' && result.gpu_host?.startsWith('colab')) {
      console.log('✅ SMOKE A PASS')
    } else {
      console.log('⚠ Result not as expected (status=completed + gpu_host=colab)')
    }
  } finally {
    await sb.from('vision_index_jobs').delete().eq('id', jobId)
    console.log(`  cleanup: synthetic job deleted`)
  }
}

async function smokeB(): Promise<void> {
  console.log('=== Smoke B: Modal fallback path ===')
  if (!CRON_SECRET) throw new Error('CRON_SECRET env var required to manually trigger the cron')
  const { orgId, visionPageId } = await preflight()

  // Confirm NO Colab workers alive (or test will be invalid)
  const cutoff = new Date(Date.now() - 60_000).toISOString()
  const { data: alive } = await sb
    .from('vision_worker_heartbeat')
    .select('worker_id')
    .gte('last_seen_at', cutoff)
    .in('status', ['idle', 'busy'])
  if (alive && alive.length > 0) {
    console.warn(`⚠ ${alive.length} Colab worker(s) still alive — they may claim the job before Modal does. Stop them first.`)
  }

  const jobId = await insertSyntheticJob(orgId, visionPageId)
  console.log(`✓ Inserted synthetic job ${jobId.slice(0, 8)}`)

  // Force the job to look stuck (created_at > 10 min ago) by updating it
  await sb
    .from('vision_index_jobs')
    .update({ created_at: new Date(Date.now() - 11 * 60_000).toISOString() })
    .eq('id', jobId)
  console.log('✓ Backdated created_at by 11 min so the cron picks it up')

  // Trigger the fallback sweep
  console.log(`✓ Hitting POST ${VERCEL_BASE}/api/cron/vision-fallback-sweep ...`)
  const res = await fetch(`${VERCEL_BASE}/api/cron/vision-fallback-sweep`, {
    method: 'GET',
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
  const body = await res.json()
  console.log('  cron response:', JSON.stringify(body, null, 2))

  try {
    const result = await waitForCompletion(jobId, 5 * 60_000)
    console.log(`\n  job.status = ${result.status}, gpu_host = ${result.gpu_host}`)
    if (result.status === 'completed' && result.gpu_host === 'modal') {
      console.log('✅ SMOKE B PASS')
    } else {
      console.log('⚠ Result not as expected (status=completed + gpu_host=modal)')
    }
  } finally {
    await sb.from('vision_index_jobs').delete().eq('id', jobId)
    console.log(`  cleanup: synthetic job deleted`)
  }
}

async function main() {
  const cmd = process.argv[2]
  if (cmd === 'colab') return smokeA()
  if (cmd === 'modal') return smokeB()
  console.log('Usage: npx tsx scripts/smoke-phase11.ts [colab|modal]')
  console.log('  colab — verify Colab worker picks up jobs end-to-end')
  console.log('  modal — verify Modal fallback cron picks up stuck jobs')
  process.exit(1)
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
