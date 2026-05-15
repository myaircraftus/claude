import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  fetchAtaChapters,
  fetchJascCodes,
  fetchAircraftTaxonomyOverrides,
  filterApplicableJascCodes,
  decorateJascCode,
} from '@/lib/taxonomy/queries'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = createServerSupabase()
    const { data: aircraft, error: aircraftError } = await supabase
      .from('aircraft')
      .select('id, organization_id, tail_number, make, model, engine_make, engine_model, taxonomy_aircraft_kind, taxonomy_engine_type, taxonomy_engine_count, taxonomy_landing_gear_type, taxonomy_profile')
      .eq('id', params.id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()

    if (aircraftError) throw new Error(aircraftError.message)
    if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

    const [chapters, jascRows, overrides] = await Promise.all([
      fetchAtaChapters(supabase),
      fetchJascCodes(supabase, { limit: 1000 }),
      fetchAircraftTaxonomyOverrides(supabase, params.id),
    ])
    const ataByCode = new Map(chapters.map((chapter) => [chapter.ata_code, chapter]))
    const applicableJasc = filterApplicableJascCodes(jascRows, aircraft, overrides)
      .map((row) => decorateJascCode(row, ataByCode.get(row.ata_code)))

    const applicableAtaCodes = new Set(applicableJasc.map((row) => row.ata_code))
    const applicableAta = chapters.filter((chapter) => applicableAtaCodes.has(chapter.ata_code))

    return NextResponse.json({
      aircraft,
      ata_chapters: applicableAta,
      jasc_codes: applicableJasc,
      overrides,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load applicable taxonomy' },
      { status: 500 },
    )
  }
}
