/**
 * POST /api/rag/rebuild-bm25
 *
 * Rebuilds the BM25 keyword index (lib/rag/bm25-index.ts) for one or more
 * aircraft. Admin/shop persona only — keyword index rebuilds are an
 * operational task, not something owners trigger.
 *
 * Body (all optional):
 *   { aircraft_id }  — rebuild that single aircraft.
 *   { org_id }       — rebuild every non-archived aircraft in that org.
 *   {}               — rebuild every aircraft in the caller's own org.
 *
 * Each aircraft is rebuilt independently — one aircraft's failure is caught,
 * recorded as a `failed` row in `rag_index_jobs`, and does NOT abort the rest
 * of the loop. Successful rebuilds optionally log a `completed` row so the
 * admin index-health endpoint can report freshness.
 *
 * Returns { rebuilt, failed, results: [...], duration_ms } where each result
 * is `{ aircraft_id, chunkCount }` on success or `{ aircraft_id, error }`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentPersona } from '@/lib/persona/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'
import { buildBm25Index } from '@/lib/rag/bm25-index'

export const dynamic = 'force-dynamic'

interface RebuildBody {
  aircraft_id?: string
  org_id?: string
}

/** Per-aircraft outcome — `chunkCount` on success, `error` on failure. */
type RebuildResult =
  | { aircraft_id: string; chunkCount: number }
  | { aircraft_id: string; error: string }

export async function POST(req: NextRequest) {
  const startedAt = Date.now()

  // Persona gate — shop/admin only.
  const { persona } = await getCurrentPersona()
  if (persona !== 'shop' && persona !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Org context — required for scoping.
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: RebuildBody = {}
  try {
    body = ((await req.json()) ?? {}) as RebuildBody
  } catch {
    body = {}
  }

  const service = createServiceSupabase()

  // Resolve the list of aircraft ids to rebuild.
  let aircraftIds: string[] = []

  if (body.aircraft_id) {
    aircraftIds = [body.aircraft_id]
  } else {
    const orgId = body.org_id ?? ctx.organizationId
    const { data, error } = await service
      .from('aircraft')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .limit(10000)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    aircraftIds = ((data ?? []) as { id: string }[]).map((row) => row.id)
  }

  const orgId = body.org_id ?? ctx.organizationId

  // Rebuild each aircraft in its own try/catch so a single failure is
  // isolated — recorded to rag_index_jobs and reported, never fatal.
  const results: RebuildResult[] = []
  let rebuilt = 0
  let failed = 0

  for (const aircraftId of aircraftIds) {
    const jobStartedAt = new Date().toISOString()
    try {
      const { chunkCount } = await buildBm25Index(aircraftId)
      results.push({ aircraft_id: aircraftId, chunkCount })
      rebuilt += 1
      // Optional success marker — gives the index-health endpoint a freshness
      // signal. Best-effort: a logging failure must not fail the rebuild.
      await service
        .from('rag_index_jobs')
        .insert({
          aircraft_id: aircraftId,
          org_id: orgId,
          job_type: 'rebuild',
          status: 'completed',
          started_at: jobStartedAt,
          completed_at: new Date().toISOString(),
        })
        .then(undefined, () => undefined)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'BM25 rebuild failed'
      results.push({ aircraft_id: aircraftId, error: message })
      failed += 1
      // Record the failure so it surfaces in the admin index-health endpoint.
      await service
        .from('rag_index_jobs')
        .insert({
          aircraft_id: aircraftId,
          org_id: orgId,
          job_type: 'rebuild',
          status: 'failed',
          started_at: jobStartedAt,
          completed_at: new Date().toISOString(),
          error: message,
        })
        .then(undefined, () => undefined)
    }
  }

  return NextResponse.json({
    rebuilt,
    failed,
    results,
    duration_ms: Date.now() - startedAt,
  })
}
