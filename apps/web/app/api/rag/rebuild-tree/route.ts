/**
 * POST /api/rag/rebuild-tree
 *
 * Rebuilds the PageIndex hierarchical tree (`page_tree_nodes`) for one document
 * or for every non-deleted document on an aircraft. This is an admin/shop
 * maintenance action — it re-derives the navigable document → chapter →
 * section → page/entry hierarchy that layers on top of the vector pipeline.
 *
 * Request:  { doc_id: string }      → rebuild that one document's tree
 *           { aircraft_id: string } → rebuild every document on that aircraft
 * Response: { nodes_created: number, duration_ms: number }
 *
 * Persona-gated to 'shop' / 'admin'. Other personas get a 403.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentPersona } from '@/lib/persona/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'
import { buildDocumentTree } from '@/lib/rag/tree-builder'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const startedAt = Date.now()

  // --- Auth + persona gate --------------------------------------------------
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let persona: string
  try {
    ;({ persona } = await getCurrentPersona())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (persona !== 'shop' && persona !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden — admin or shop persona required' },
      { status: 403 },
    )
  }

  // --- Parse body -----------------------------------------------------------
  const body = await req.json().catch(() => null)
  const docId = typeof body?.doc_id === 'string' ? body.doc_id.trim() : ''
  const aircraftId = typeof body?.aircraft_id === 'string' ? body.aircraft_id.trim() : ''

  if (!docId && !aircraftId) {
    return NextResponse.json(
      { error: 'doc_id or aircraft_id is required' },
      { status: 400 },
    )
  }

  const supabase = createServiceSupabase()

  // Resolve the set of (docId, aircraftId) pairs to rebuild.
  const targets: { docId: string; aircraftId: string }[] = []

  if (docId) {
    const { data: doc, error } = await supabase
      .from('documents')
      .select('id, aircraft_id, organization_id, deleted_at')
      .eq('id', docId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    if (doc.organization_id !== ctx.organizationId) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    if (!doc.aircraft_id) {
      return NextResponse.json(
        { error: 'Document is not associated with an aircraft' },
        { status: 400 },
      )
    }
    targets.push({ docId: doc.id, aircraftId: doc.aircraft_id })
  } else {
    const { data: docs, error } = await supabase
      .from('documents')
      .select('id, aircraft_id')
      .eq('aircraft_id', aircraftId)
      .eq('organization_id', ctx.organizationId)
      .is('deleted_at', null)
      .limit(10000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const d of docs ?? []) {
      const row = d as { id: string; aircraft_id: string | null }
      if (row.aircraft_id) targets.push({ docId: row.id, aircraftId: row.aircraft_id })
    }
  }

  // --- Build trees ----------------------------------------------------------
  let nodesCreated = 0
  for (const t of targets) {
    try {
      const { nodesCreated: n } = await buildDocumentTree(t.docId, t.aircraftId)
      nodesCreated += n
    } catch (err) {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : 'Tree build failed',
          doc_id: t.docId,
          nodes_created: nodesCreated,
        },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({
    nodes_created: nodesCreated,
    duration_ms: Date.now() - startedAt,
  })
}
