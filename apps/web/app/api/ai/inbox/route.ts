/**
 * GET /api/ai/inbox (Spec 0.3)
 *
 * Returns active ActionCards for the current user × active org × resolved
 * persona (from `getCurrentPersona`). Cards with `persona = NULL` go to
 * everyone in the org; persona-specific cards are filtered.
 *
 * On every fetch we lazily run one orchestrator tick if there are
 * unprocessed signals — this means a freshly-emitted signal turns into a
 * card without waiting for a cron. Cron stays as a TODO follow-up
 * (vercel.json schedule entry would be added in deployment-config sprint).
 *
 * Query params:
 *   - status=active|all (default: active)
 *   - limit=N (default 50, max 200)
 *
 * Response:
 *   {
 *     cards: ActionCard[],
 *     persona: Persona,
 *     ticked: TickResult | null
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentPersona } from '@/lib/persona/server'
import { tickOrchestrator, type TickResult } from '@/lib/ai/orchestrator'

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const status = req.nextUrl.searchParams.get('status') === 'all' ? 'all' : 'active'
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10)
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 200)

  const persona = await getCurrentPersona()

  // Lazy tick: if there are unprocessed signals, drain them so the user sees
  // up-to-date cards without waiting for a cron. Cheap when there are none.
  let ticked: TickResult | null = null
  const { count: pending } = await supabase
    .from('ai_signals')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organizationId)
    .is('processed_at', null)
  if ((pending ?? 0) > 0) {
    ticked = await tickOrchestrator(supabase, ctx.organizationId)
  }

  let q = supabase
    .from('ai_action_cards')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    // persona = NULL OR persona = active persona
    .or(`persona.is.null,persona.eq.${persona.persona}`)

  if (status === 'active') {
    q = q.is('dismissed_at', null).is('resolved_at', null)
  }

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sort by priority first, then by recency (newer wins on tie).
  const cards = (data ?? []).slice().sort((a: any, b: any) => {
    const pa = PRIORITY_RANK[a.priority] ?? 2
    const pb = PRIORITY_RANK[b.priority] ?? 2
    if (pa !== pb) return pa - pb
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return NextResponse.json({
    cards,
    persona: persona.persona,
    ticked,
  })
}
