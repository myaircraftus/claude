/**
 * /api/aircraft/[id]/analysis  (Spec 7.6)
 *
 *   GET  → cached analysis (≤ 24h old) from ai_activity_log, or null
 *   POST → run a fresh analysis (bypasses cache); body { period?: '30d'|'90d'|'365d' }
 *
 * Cache strategy: ai_activity_log already records every LLM call with
 * scope + entity_id + context. Reading the latest 'aircraft-analysis' row
 * for the aircraft is the cache; no separate table.
 *
 * Owner+/admin/mechanic can trigger; viewers/auditors get 403 on POST.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { computeTrueOperatingCost, type LookbackPeriod } from '@/lib/costs/calculator'
import { analyzeAircraft, type AircraftAnalysisOutput } from '@/lib/ai/analyzers/aircraft-analysis'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VALID_PERIODS = new Set<LookbackPeriod>(['30d', '90d', '365d'])
const WRITE_ROLES = new Set(['owner', 'admin', 'mechanic'])
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

interface CachedRow {
  id: string
  created_at: string
  scope: string
  entity_id: string | null
  status: string
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd_cents: number | null
  context: Record<string, unknown> | null
}

async function loadLatestCached(
  supabase: ReturnType<typeof createServiceSupabase>,
  organizationId: string,
  aircraftId: string,
): Promise<{ row: CachedRow; output: AircraftAnalysisOutput } | null> {
  const { data } = await supabase
    .from('ai_activity_log')
    .select('id, created_at, scope, entity_id, status, model, input_tokens, output_tokens, cost_usd_cents, context')
    .eq('organization_id', organizationId)
    .eq('scope', 'aircraft-analysis')
    .eq('entity_id', aircraftId)
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const row = (data ?? null) as CachedRow | null
  if (!row) return null
  const out = (row.context as { output?: AircraftAnalysisOutput } | null)?.output ?? null
  if (!out) return null
  return { row, output: out }
}

function isFresh(row: CachedRow): boolean {
  return Date.now() - new Date(row.created_at).getTime() < CACHE_MAX_AGE_MS
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  // Verify aircraft belongs to this org.
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id')
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
    .maybeSingle()
  if (!aircraft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const service = createServiceSupabase()
  const cached = await loadLatestCached(service, membership.organization_id, params.id)
  if (!cached) return NextResponse.json({ analysis: null, fresh: false })
  return NextResponse.json({
    analysis: cached.output,
    fresh: isFresh(cached.row),
    generated_at: cached.row.created_at,
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!WRITE_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // Period override (default 365d for AI summary so the model has the most context).
  let period: LookbackPeriod = '365d'
  try {
    const body = await req.json().catch(() => ({}))
    if (body && VALID_PERIODS.has(body.period)) period = body.period as LookbackPeriod
  } catch { /* empty body OK */ }

  // Org-scoped aircraft fetch (verifies tenancy + supplies make/model/year).
  const { data: aircraftRow } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, year, total_time_hours')
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
    .maybeSingle()
  if (!aircraftRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const aircraft = aircraftRow as {
    id: string; tail_number: string; make: string | null;
    model: string | null; year: number | null; total_time_hours: number | null;
  }

  // 1. Compute the cost breakdown (RLS-scoped read).
  const cost = await computeTrueOperatingCost({
    supabase,
    organizationId: membership.organization_id,
    aircraftId: params.id,
    period,
  })

  // 2. Pull recent maintenance summaries for context (best-effort).
  const { data: meRows } = await supabase
    .from('maintenance_events')
    .select('event_date, event_type, description')
    .eq('organization_id', membership.organization_id)
    .eq('aircraft_id', params.id)
    .order('event_date', { ascending: false })
    .limit(8)
  const recent_maintenance = (meRows ?? []).map((r) => {
    const row = r as { event_date: string | null; event_type: string | null; description: string | null }
    return [row.event_date, row.event_type, row.description].filter(Boolean).join(' — ')
  }).filter(Boolean)

  // 3. Run the analysis (writes ai_activity_log via callAnthropic).
  const service = createServiceSupabase()
  let output: AircraftAnalysisOutput
  try {
    output = await analyzeAircraft(service, {
      organization_id: membership.organization_id,
      user_id: user.id,
      aircraft_id: params.id,
      tail_number: aircraft.tail_number,
      make: aircraft.make,
      model: aircraft.model,
      year: aircraft.year,
      total_time_hours: aircraft.total_time_hours,
      cost,
      revenue_ytd: 0, // rental_rate column not yet present (7.4 follow-up)
      recent_maintenance,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Analysis failed' },
      { status: 500 },
    )
  }

  // 4. Persist the structured output back onto the activity-log row's
  //    context.output so GET can read it back as cache. The callAnthropic
  //    wrapper already wrote a row; we update the latest row for this scope+entity.
  const cached = await loadLatestCached(service, membership.organization_id, params.id)
  if (cached?.row.id) {
    await service
      .from('ai_activity_log')
      .update({
        context: {
          ...(cached.row.context ?? {}),
          output,
        },
      })
      .eq('id', cached.row.id)
  }

  return NextResponse.json({ analysis: output, fresh: true, generated_at: output.generated_at })
}
