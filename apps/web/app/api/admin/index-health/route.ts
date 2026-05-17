/**
 * GET /api/admin/index-health
 *
 * Admin-only diagnostic for the PageIndex RAG layer. Reports, per non-archived
 * aircraft in the caller's org, whether its BM25 keyword index and document
 * tree are fresh: document count, last successful rebuild time, tree node
 * count, failed-job count, and a derived `stale` flag.
 *
 * One `rag_index_jobs` rebuild builds both the BM25 index and the tree, so a
 * single `last_indexed_at` covers both. `stale` is true when an aircraft has
 * documents but has never been indexed, or has at least one failed job.
 *
 * Persona-gated to 'admin'. Returns { aircraft: [...], generated_at }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentPersona } from '@/lib/persona/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Per-aircraft index health row in the response. */
interface AircraftIndexHealth {
  aircraft_id: string
  tail_number: string | null
  doc_count: number
  last_indexed_at: string | null
  tree_node_count: number
  failed_job_count: number
  stale: boolean
}

export async function GET(req: NextRequest) {
  // --- Auth + persona gate --------------------------------------------------
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let persona: string
  try {
    ;({ persona } = await getCurrentPersona())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (persona !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden — admin persona required' },
      { status: 403 },
    )
  }

  const supabase = createServiceSupabase()

  // --- Aircraft in this org -------------------------------------------------
  const { data: aircraftData, error: aircraftErr } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('organization_id', ctx.organizationId)
    .eq('is_archived', false)
    .limit(10000)
  if (aircraftErr) {
    return NextResponse.json({ error: aircraftErr.message }, { status: 500 })
  }

  const aircraftRows = ((aircraftData ?? []) as {
    id: string
    tail_number: string | null
  }[])

  // Per-aircraft stats — each gathered with a fault-tolerant count query so a
  // single failed read degrades to 0 rather than crashing the whole report.
  const aircraft: AircraftIndexHealth[] = []
  for (const ac of aircraftRows) {
    // Non-deleted document count.
    const { count: docCount } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('aircraft_id', ac.id)
      .is('deleted_at', null)

    // Most recent successful rebuild — covers both BM25 + tree freshness.
    const { data: lastJob } = await supabase
      .from('rag_index_jobs')
      .select('completed_at')
      .eq('aircraft_id', ac.id)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)

    // Persisted document-tree node count.
    const { count: treeCount } = await supabase
      .from('page_tree_nodes')
      .select('id', { count: 'exact', head: true })
      .eq('aircraft_id', ac.id)

    // Failed rebuild jobs still outstanding for this aircraft.
    const { count: failedCount } = await supabase
      .from('rag_index_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('aircraft_id', ac.id)
      .eq('status', 'failed')

    const doc_count = docCount ?? 0
    const tree_node_count = treeCount ?? 0
    const failed_job_count = failedCount ?? 0
    const last_indexed_at =
      (lastJob?.[0] as { completed_at: string | null } | undefined)?.completed_at ?? null

    aircraft.push({
      aircraft_id: ac.id,
      tail_number: ac.tail_number,
      doc_count,
      last_indexed_at,
      tree_node_count,
      failed_job_count,
      // Stale: has documents but is unindexed, or has any failed rebuild.
      stale: doc_count > 0 && (last_indexed_at === null || failed_job_count > 0),
    })
  }

  return NextResponse.json({
    aircraft,
    generated_at: new Date().toISOString(),
  })
}
