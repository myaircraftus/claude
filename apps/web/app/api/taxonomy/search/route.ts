import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  fetchAtaChapters,
  fetchJascCodes,
  fetchAircraftTaxonomyOverrides,
  filterApplicableJascCodes,
  searchTaxonomyRows,
  type AircraftTaxonomyProfile,
} from '@/lib/taxonomy/queries'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const aircraftId = searchParams.get('aircraft_id')
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 200)

  try {
    const supabase = createServerSupabase()
    const [chapters, rows] = await Promise.all([
      fetchAtaChapters(supabase),
      fetchJascCodes(supabase, { limit: 1000 }),
    ])
    const ataByCode = new Map(chapters.map((chapter) => [chapter.ata_code, chapter]))

    let searchRows = rows
    let aircraft: AircraftTaxonomyProfile | null = null
    if (aircraftId) {
      const { data: aircraftRow, error: aircraftError } = await supabase
        .from('aircraft')
        .select('id, organization_id, make, model, engine_make, engine_model, taxonomy_aircraft_kind, taxonomy_engine_type, taxonomy_engine_count')
        .eq('id', aircraftId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle()

      if (aircraftError) throw new Error(aircraftError.message)
      if (!aircraftRow) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

      aircraft = aircraftRow
      const overrides = await fetchAircraftTaxonomyOverrides(supabase, aircraftId)
      searchRows = filterApplicableJascCodes(rows, aircraft, overrides)
    }

    const results = searchTaxonomyRows(searchRows, ataByCode, q).slice(0, limit)
    return NextResponse.json({ query: q, aircraft_id: aircraftId, aircraft, results })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to search taxonomy' },
      { status: 500 },
    )
  }
}
