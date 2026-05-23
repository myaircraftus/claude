/**
 * GET /api/work-orders/[id]/rts-check
 *
 * Synchronous pre-RTS sanity check called by the WO detail UI just
 * before the mechanic clicks "Sign as RTS". Returns { ok, blockers,
 * warnings } from workforce.return-to-service-checker.
 *
 * Blockers should disable the sign button. Warnings can be presented
 * with an "override" toggle (the override gets audit-logged via the
 * normal agent_runs trail).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { checkReturnToService } from '@/lib/agents/impl/workforce-return-to-service-checker'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()
  const result = await checkReturnToService({
    supabase: service,
    triggeredBy: user.id,
    workOrderId: params.id,
  })
  return NextResponse.json({
    ok: result.output?.ok ?? false,
    blockers: result.output?.blockers ?? [],
    warnings: result.output?.warnings ?? [],
    run_id: result.runId,
  })
}
