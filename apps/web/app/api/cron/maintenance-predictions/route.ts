/**
 * GET /api/cron/maintenance-predictions  (Spec 5.3)
 *
 * Nightly sweep — runs the heuristic predictors against every active
 * aircraft in every org and upserts an ai_action_cards row (category=
 * 'prediction') for any high-priority finding. Idempotent via
 * dedupe_key=`predict:<kind>:<aircraft_id>` so re-running refreshes the
 * existing card rather than creating duplicates.
 *
 * Same auth pattern as 5.5 wo-audit cron — vercel-cron UA OR Bearer
 * CRON_SECRET. Bounded at MAX_AIRCRAFT_PER_TICK to stay within the
 * function cap.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { runAircraftPredictors } from '@/lib/ai/predictors/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_AIRCRAFT_PER_TICK = 50

function isVercelCronRequest(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? ''
  if (ua.startsWith('vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isVercelCronRequest(req)) {
    return NextResponse.json({ error: 'Cron only' }, { status: 401 })
  }

  const service = createServiceSupabase()
  const { data: aircraftRows, error } = await service
    .from('aircraft')
    .select('id, organization_id, tail_number')
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .limit(MAX_AIRCRAFT_PER_TICK)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const aircraft = (aircraftRows ?? []) as Array<{ id: string; organization_id: string; tail_number: string }>
  const results: Array<{ aircraft_id: string; tail: string; cards: number }> = []

  for (const a of aircraft) {
    const predictions = await runAircraftPredictors(service, {
      organization_id: a.organization_id,
      aircraft_id: a.id,
      narrate: true,
    })
    let cardCount = 0
    for (const p of predictions) {
      if (p.priority === 'low') continue
      const dedupeKey = `predict:${p.kind}:${a.id}`
      const body = (p as { narrated_body?: string }).narrated_body ?? p.headline
      const evidence = p.evidence
      const suggested_actions = p.cta ? [{
        label: p.cta.label,
        toolCall: { tool: p.cta.tool, args: p.cta.args },
      }] : []

      // Upsert by dedupe_key — refresh evidence + body on re-run, keep id.
      const { data: existing } = await service
        .from('ai_action_cards')
        .select('id')
        .eq('organization_id', a.organization_id)
        .eq('dedupe_key', dedupeKey)
        .is('dismissed_at', null)
        .is('resolved_at', null)
        .maybeSingle()

      const cardRow = {
        organization_id: a.organization_id,
        persona: null,
        priority: p.priority,
        category: 'prediction',
        title: `${a.tail_number} — ${p.headline}`,
        body,
        evidence,
        suggested_actions,
        confidence: p.confidence,
        source: 'ml' as const,
        dedupe_key: dedupeKey,
        source_signal_id: null,
      }

      if (existing) {
        await service
          .from('ai_action_cards')
          .update({ ...cardRow, created_at: new Date().toISOString() })
          .eq('id', (existing as { id: string }).id)
      } else {
        await service.from('ai_action_cards').insert(cardRow)
      }
      cardCount++
    }
    results.push({ aircraft_id: a.id, tail: a.tail_number, cards: cardCount })
  }

  return NextResponse.json({ swept: results.length, results })
}
