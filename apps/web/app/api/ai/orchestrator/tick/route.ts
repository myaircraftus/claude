/**
 * POST /api/ai/orchestrator/tick (Spec 0.3)
 *
 * Manually trigger the orchestrator for the user's active org. Used by:
 *   - the acceptance harness (verifies signal → card pipeline)
 *   - dev tooling (force a tick after seeding signals)
 *   - a future cron (vercel.json schedule entry — TODO)
 *
 * Returns: { ok, ticked: TickResult }
 *
 * Permission: any authenticated org member. The orchestrator only emits
 * cards based on signals already persisted (which are themselves
 * permission-gated), so triggering a tick can't escalate anything.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { tickOrchestrator } from '@/lib/ai/orchestrator'

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const ticked = await tickOrchestrator(supabase, ctx.organizationId)
  return NextResponse.json({ ok: true, ticked })
}
