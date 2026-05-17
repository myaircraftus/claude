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
 * Returns { rebuilt, results: [{ aircraft_id, chunkCount }], duration_ms }.
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

interface RebuildResult {
  aircraft_id: string
  chunkCount: number
}

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

  const results: RebuildResult[] = []
  for (const aircraftId of aircraftIds) {
    const { chunkCount } = await buildBm25Index(aircraftId)
    results.push({ aircraft_id: aircraftId, chunkCount })
  }

  return NextResponse.json({
    rebuilt: results.length,
    results,
    duration_ms: Date.now() - startedAt,
  })
}
