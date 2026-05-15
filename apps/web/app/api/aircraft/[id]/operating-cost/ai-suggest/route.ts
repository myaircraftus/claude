/**
 * POST /api/aircraft/[id]/operating-cost/ai-suggest
 *
 * Asks OpenAI for a realistic operating-cost estimate for the aircraft
 * (make / model / year / engine). Used by the "AI Suggest" button on the
 * Operating Cost form. Returns { source: 'ai_suggested', data } or a 502
 * if the AI is unavailable. Pure read — persists nothing; the owner
 * reviews/edits the values and saves via PUT .../operating-cost/profile.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { suggestOperatingCost } from '@/lib/economics/operating-cost-ai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, make, model, year, engine_make, engine_model')
    .eq('organization_id', orgId)
    .eq('id', params.id)
    .maybeSingle()

  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }

  const ac = aircraft as {
    make: string | null
    model: string | null
    year: number | null
    engine_make: string | null
    engine_model: string | null
  }

  const suggestion = await suggestOperatingCost({
    year: ac.year,
    make: ac.make,
    model: ac.model,
    engine: [ac.engine_make, ac.engine_model].filter(Boolean).join(' ') || null,
  })

  if (!suggestion) {
    return NextResponse.json(
      { error: 'AI suggestion is unavailable right now — fill the form manually or try again.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ source: 'ai_suggested', data: suggestion })
}
