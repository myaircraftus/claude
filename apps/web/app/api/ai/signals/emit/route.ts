/**
 * POST /api/ai/signals/emit (Spec 0.3)
 *
 * Authenticated callers in the active org can emit a signal. Mostly used
 * by the acceptance harness + dev tooling — production signals are
 * emitted server-to-server via `lib/ai/signals.ts:emitSignal()` directly
 * from the relevant API routes (e.g. /api/aircraft/[id]/meter-reading
 * once Feature 1.1 ships).
 *
 * Body: { type: AISignalType, payload?: object, source?: 'user'|'system'|'integration' }
 *
 * Returns: { ok, signal_id, processed?: TickResult }
 *
 * If `?tick=1` is in the query string, the orchestrator is run synchronously
 * for the user's active org so the caller (e.g. the acceptance harness) can
 * see the resulting ActionCards on the next /api/ai/inbox fetch.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { emitSignal, isValidSignalType } from '@/lib/ai/signals'
import { tickOrchestrator } from '@/lib/ai/orchestrator'

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { type?: string; payload?: Record<string, unknown>; source?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isValidSignalType(body.type)) {
    return NextResponse.json(
      { error: 'Unknown signal type. See lib/ai/types.ts AISignalType.' },
      { status: 400 },
    )
  }

  const supabase = createServerSupabase()
  const signalId = await emitSignal(supabase, ctx.organizationId, ctx.user.id, {
    type: body.type,
    payload: body.payload ?? {},
    source: (body.source as any) ?? 'user',
  })

  if (!signalId) {
    return NextResponse.json({ error: 'Signal emit failed' }, { status: 500 })
  }

  // Optional inline tick for acceptance harness and dev triggers.
  const shouldTick = req.nextUrl.searchParams.get('tick') === '1'
  if (shouldTick) {
    const tick = await tickOrchestrator(supabase, ctx.organizationId)
    return NextResponse.json({ ok: true, signal_id: signalId, processed: tick })
  }

  return NextResponse.json({ ok: true, signal_id: signalId })
}
