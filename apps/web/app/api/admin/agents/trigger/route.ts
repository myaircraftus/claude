/**
 * POST /api/admin/agents/trigger
 *
 * Admin-only endpoint to invoke a cron-triggered agent on demand. Used
 * by the "Run now" button on /admin/agents.
 *
 * Body: { agent_id: string }
 * Returns: { ok, run_id, output? } or { error }
 *
 * Only dispatches agents whose registry status === 'active' and whose
 * trigger === 'cron'. Anything else gets refused. This isn't a generic
 * RPC into the agent system — it's a tightly scoped admin button.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { getAgent } from '@/lib/agents/registry'
import { curateKbDrafts } from '@/lib/agents/impl/support-kb-curator'
import { sanitiseOcrDates } from '@/lib/agents/impl/data-quality-ocr-date-sanitiser'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { agent_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const agentId = (body.agent_id ?? '').trim()
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

  let def
  try {
    def = getAgent(agentId)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown agent' },
      { status: 404 },
    )
  }

  if (def.status !== 'active') {
    return NextResponse.json({ error: `Agent is ${def.status}, not active` }, { status: 400 })
  }
  if (def.trigger !== 'cron') {
    return NextResponse.json(
      { error: `Agent trigger is ${def.trigger}; only cron agents are triggerable here` },
      { status: 400 },
    )
  }

  const service = createServiceSupabase()

  switch (agentId) {
    case 'support.kb-curator': {
      const result = await curateKbDrafts({ supabase: service })
      return NextResponse.json({
        ok: result.ok,
        run_id: result.runId,
        output: result.output,
        error: result.error,
      })
    }
    case 'data-quality.ocr-date-sanitiser': {
      const result = await sanitiseOcrDates({ supabase: service })
      return NextResponse.json({
        ok: result.ok,
        run_id: result.runId,
        output: result.output,
        error: result.error,
      })
    }
    default:
      return NextResponse.json(
        { error: `No trigger implementation for ${agentId}` },
        { status: 501 },
      )
  }
}
