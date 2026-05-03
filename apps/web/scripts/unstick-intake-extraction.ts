/**
 * One-shot recovery script: invoke runExtraction directly for stuck
 * intake_documents rows that the prior `void IIFE` antipattern killed
 * before they reached the orchestrator.
 *
 * Run from apps/web/:
 *   pnpm exec tsx scripts/unstick-intake-extraction.ts
 *
 * Reads ANTHROPIC_API_KEY + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * from .env.local. Selects rows with status='received' and created_at >
 * now() - 24 hours, then calls runExtraction in series so we don't fan out
 * concurrent Anthropic requests.
 */
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load production env (pulled via `vercel env pull .env.production`).
// Falls back to .env.local for any keys not in production.
// override:true so empty/blank values inherited from the parent shell
// don't shadow real values in the dotfile.
loadEnv({ path: '.env.production', override: true })
loadEnv({ path: '.env.local', override: false })

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
    process.exit(1)
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY — extraction would throw')
    process.exit(1)
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await admin
    .from('intake_documents')
    .select('id, status, created_at, source, mime_type, file_size_bytes')
    .eq('status', 'received')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
  if (error) { console.error(error); process.exit(1) }
  const rows = (data ?? []) as Array<{
    id: string; status: string; created_at: string; source: string;
    mime_type: string | null; file_size_bytes: number | null;
  }>
  if (rows.length === 0) {
    console.log('No stuck rows in the last 24h.')
    return
  }
  console.log(`Found ${rows.length} stuck row(s).`)

  const { runExtraction } = await import('../lib/ai/extractors/run')
  for (const row of rows) {
    console.log(`→ extract ${row.id} (${row.mime_type}, ${row.file_size_bytes} bytes)`)
    try {
      const result = await runExtraction({ intake_document_id: row.id })
      console.log(`  result:`, result)
    } catch (e) {
      console.error(`  FAILED:`, e instanceof Error ? e.message : e)
    }
  }

  // Final status snapshot.
  const { data: after } = await admin
    .from('intake_documents')
    .select('id, status, error_message, extraction_started_at, extraction_completed_at')
    .in('id', rows.map((r) => r.id))
  console.log('Final state:')
  for (const r of (after ?? [])) console.log(' ', r)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
