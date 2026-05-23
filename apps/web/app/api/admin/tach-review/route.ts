/**
 * GET  /api/admin/tach-review  → most recent tach_time_review recommendation
 * POST /api/admin/tach-review/apply → apply a single delta or add a new aircraft
 *
 * The data-sync.tach-time-scraper emits a 'tach_time_review' recommendation
 * row into agent_runs. The admin uses this page to accept/reject each
 * delta + proposed aircraft. Approved deltas update
 * aircraft.total_time_hours; approved proposals insert a new aircraft.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function ensureAdmin(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' as const, status: 401 }
  const service = createServiceSupabase()
  const { data: profile } = await service
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.is_platform_admin) return { error: 'Forbidden' as const, status: 403 }
  return { service, user }
}

export async function GET(req: NextRequest) {
  const guard = await ensureAdmin(req)
  if ('error' in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }
  const { service } = guard

  // Most recent succeeded scraper run with a non-null recommendation
  const { data: rows } = await service
    .from('agent_runs')
    .select('id, recommendation, completed_at, status')
    .eq('agent_id', 'data-sync.tach-time-scraper')
    .eq('status', 'succeeded')
    .not('recommendation', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
  const row = (rows ?? [])[0]
  if (!row?.recommendation) {
    return NextResponse.json({ latest_run: null, deltas: [], proposed_new_aircraft: [] })
  }
  const rec = row.recommendation as {
    kind?: string
    deltas?: Array<unknown>
    proposed_new_aircraft?: Array<unknown>
  }
  return NextResponse.json({
    latest_run: { id: row.id, completed_at: row.completed_at },
    deltas: rec.deltas ?? [],
    proposed_new_aircraft: rec.proposed_new_aircraft ?? [],
  })
}

export async function POST(req: NextRequest) {
  const guard = await ensureAdmin(req)
  if ('error' in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }
  const { service } = guard

  const body = (await req.json().catch(() => ({}))) as {
    apply_delta?: { aircraft_id: string; scraped_hours: number }
    apply_proposal?: {
      tail_number: string
      make: string | null
      model: string | null
      year: number | null
      organization_id: string
      scraped_hours: number | null
    }
  }

  if (body.apply_delta?.aircraft_id) {
    const { error } = await service
      .from('aircraft')
      .update({ total_time_hours: body.apply_delta.scraped_hours })
      .eq('id', body.apply_delta.aircraft_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, kind: 'delta_applied' })
  }
  if (body.apply_proposal?.tail_number && body.apply_proposal?.organization_id) {
    const { data: row, error } = await service
      .from('aircraft')
      .insert({
        organization_id: body.apply_proposal.organization_id,
        tail_number: body.apply_proposal.tail_number.toUpperCase(),
        make: body.apply_proposal.make,
        model: body.apply_proposal.model,
        year: body.apply_proposal.year,
        total_time_hours: body.apply_proposal.scraped_hours,
        is_archived: false,
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, kind: 'proposal_applied', aircraft_id: row.id })
  }
  return NextResponse.json({ error: 'apply_delta or apply_proposal required' }, { status: 400 })
}
