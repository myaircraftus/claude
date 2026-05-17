/**
 * POST /api/intelligence/component-search — Component History Search module
 * of the Aircraft Intelligence Suite.
 *
 * A live, real-time record search: given a query and a search mode, it returns
 * the matching record chunks from this aircraft's uploaded documents. Owner-only
 * — the shop persona is blocked. Unlike the report modules, results are NOT
 * cached; every request runs a fresh search.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { getCurrentPersona } from '@/lib/persona/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { searchAircraftRecords } from '@/lib/rag/intelligence-query'
import type { AircraftRecordSearchHit } from '@/lib/intelligence/types'

export const dynamic = 'force-dynamic'

type SearchMode = 'smart' | 'exact' | 'semantic'

interface SearchFilters {
  doc_types?: string[]
  date_from?: string
  date_to?: string
}

export async function POST(req: NextRequest) {
  // --- Auth: org context + owner-only persona gate -------------------------
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { organizationId } = ctx

  try {
    const { persona } = await getCurrentPersona()
    if (persona === 'shop') {
      return NextResponse.json(
        { error: 'Aircraft Intelligence is owner-only.' },
        { status: 403 },
      )
    }
  } catch {
    // defensive — resolveRequestOrgContext already proved a session
  }

  // --- Body ----------------------------------------------------------------
  let body: {
    aircraft_id?: unknown
    query?: unknown
    mode?: unknown
    filters?: unknown
  } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const aircraftId = typeof body.aircraft_id === 'string' ? body.aircraft_id : ''
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  const mode: SearchMode =
    body.mode === 'exact' || body.mode === 'semantic' ? body.mode : 'smart'

  if (!aircraftId) {
    return NextResponse.json({ error: 'aircraft_id is required' }, { status: 400 })
  }
  if (!query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  // Normalize filters defensively — anything malformed is simply ignored.
  const rawFilters = (body.filters ?? {}) as Record<string, unknown>
  const filters: SearchFilters = {
    doc_types: Array.isArray(rawFilters.doc_types)
      ? rawFilters.doc_types.filter((t): t is string => typeof t === 'string')
      : undefined,
    date_from: typeof rawFilters.date_from === 'string' ? rawFilters.date_from : undefined,
    date_to: typeof rawFilters.date_to === 'string' ? rawFilters.date_to : undefined,
  }

  const supabase = createServiceSupabase()

  // --- Verify the aircraft belongs to this org ----------------------------
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id')
    .eq('id', aircraftId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }

  // --- Run the live search (never throws) ---------------------------------
  let hits = await searchAircraftRecords({ organizationId, aircraftId, query, mode })

  // --- Post-filter the hits by doc_type / entry_date range ----------------
  const wantTypes =
    filters.doc_types && filters.doc_types.length > 0
      ? new Set(filters.doc_types.map((t) => t.toLowerCase()))
      : null

  hits = hits.filter((hit: AircraftRecordSearchHit) => {
    if (wantTypes && !wantTypes.has(String(hit.doc_type ?? '').toLowerCase())) {
      return false
    }
    if (filters.date_from || filters.date_to) {
      // A hit without an entry date can't satisfy a date-range filter.
      if (!hit.entry_date) return false
      if (filters.date_from && hit.entry_date < filters.date_from) return false
      if (filters.date_to && hit.entry_date > filters.date_to) return false
    }
    return true
  })

  // Already sorted by relevance and capped at 20 by searchAircraftRecords.
  return NextResponse.json({ results: hits.slice(0, 20) })
}
