/**
 * GET /api/aircraft/[id]/intelligence
 *
 * AI maintenance-health report for one aircraft, built from its logbook
 * entries, open squawks, and recent work orders.
 *
 * Response:
 *   { empty: true, aircraftId }                — no logbook history yet
 *   { report, generatedAt, aircraftId }        — generated report
 *   { error }                                  — AI unavailable (502)
 *
 * Cached for 1h (Cache-Control: max-age=3600). `?refresh=1` bypasses by
 * sending no-store so the browser/CDN re-requests a fresh report.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { generateAircraftIntelligence, type IntelligenceInput } from '@/lib/aircraft/intelligence-ai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, membership } = await requireAppServerSession()
  const orgId = membership.organization_id
  const aircraftId = params.id

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, year, engine_make, engine_model, total_time_hours')
    .eq('organization_id', orgId)
    .eq('id', aircraftId)
    .maybeSingle()

  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }
  const ac = aircraft as {
    tail_number: string
    make: string | null
    model: string | null
    year: number | null
    engine_make: string | null
    engine_model: string | null
    total_time_hours: number | null
  }

  const [logbookRes, squawksRes, workOrdersRes] = await Promise.all([
    supabase
      .from('logbook_entries')
      .select('entry_date, entry_type, description, mechanic_name, created_at')
      .eq('organization_id', orgId)
      .eq('aircraft_id', aircraftId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('squawks')
      .select('title, description, severity, reported_at')
      .eq('organization_id', orgId)
      .eq('aircraft_id', aircraftId)
      .neq('status', 'closed')
      .neq('status', 'resolved')
      .order('reported_at', { ascending: false })
      .limit(25),
    supabase
      .from('work_orders')
      .select('work_order_number, complaint, status, opened_at, closed_at, created_at')
      .eq('organization_id', orgId)
      .eq('aircraft_id', aircraftId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const logbook = (logbookRes.data ?? []) as any[]

  // No history → caller renders the empty state (no AI call burned).
  if (logbook.length === 0) {
    return NextResponse.json({ empty: true, aircraftId })
  }

  const input: IntelligenceInput = {
    year: ac.year,
    make: ac.make,
    model: ac.model,
    engine: [ac.engine_make, ac.engine_model].filter(Boolean).join(' ') || null,
    totalTime: ac.total_time_hours,
    logbook: logbook.map((e) => ({
      date: e.entry_date ?? e.created_at ?? null,
      type: e.entry_type ?? null,
      description: e.description ?? null,
      mechanic: e.mechanic_name ?? null,
    })),
    squawks: ((squawksRes.data ?? []) as any[]).map((s) => ({
      title: s.title ?? null,
      description: s.description ?? null,
      severity: s.severity ?? null,
      opened: s.reported_at ?? null,
    })),
    workOrders: ((workOrdersRes.data ?? []) as any[]).map((w) => ({
      title: w.work_order_number ? `${w.work_order_number}${w.complaint ? ` — ${w.complaint}` : ''}` : w.complaint ?? null,
      status: w.status ?? null,
      opened: w.opened_at ?? w.created_at ?? null,
      closed: w.closed_at ?? null,
    })),
  }

  const report = await generateAircraftIntelligence(input)
  if (!report) {
    return NextResponse.json(
      { error: 'Unable to generate report right now. Please try again in a few minutes.' },
      { status: 502 },
    )
  }

  const refresh = new URL(req.url).searchParams.get('refresh') === '1'
  return NextResponse.json(
    {
      report,
      generatedAt: new Date().toISOString(),
      aircraftId,
      openSquawkCount: input.squawks.length,
    },
    {
      headers: {
        'Cache-Control': refresh ? 'no-store' : 'private, max-age=3600',
      },
    },
  )
}
