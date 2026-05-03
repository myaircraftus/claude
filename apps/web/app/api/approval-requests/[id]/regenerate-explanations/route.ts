/**
 * POST /api/approval-requests/[id]/regenerate-explanations  (Spec 5.6)
 *
 * Operator-triggered: regenerate plain-English explanations for every line
 * item on one approval request.
 *
 * Also called automatically (server-to-server) from /send so the customer
 * sees explanations on first open. The mode is the same; the difference
 * is just whether the caller is an authenticated user (manual) or the
 * send route in-process (background).
 *
 * Cost cap: refuses when an approval has > MAX_LINES_PER_REQUEST line
 * items. Operator falls back to the technical-view-only experience and
 * gets a clear error.
 *
 * Failures are tolerated per-line: if the LLM 5xx's on line #3, lines #1
 * and #2 still land — the customer view falls back to operator's
 * description for any line that has ai_explanation_md NULL.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { explainApprovalLine } from '@/lib/ai/explainers/approval-line'
import { logCapExceeded } from '@/lib/ai/anthropic'

export const dynamic = 'force-dynamic'
// Long-running by Vercel default; cap at 60s so we don't hold a hot
// function past the cron-tick interval.
export const maxDuration = 60

const MAX_LINES_PER_REQUEST = 50
const ALLOWED_ROLES = new Set(['owner', 'admin', 'mechanic'])

interface ExplainStats {
  total_lines: number
  generated: number
  skipped: number
  failed: number
  cost_usd_cents: number
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
  if (!ALLOWED_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === '1'

  const stats = await regenerateForApprovalRequest({
    organization_id: membership.organization_id,
    user_id: user.id,
    approval_request_id: params.id,
    force,
  })

  if (stats === 'cap-exceeded') {
    return NextResponse.json(
      {
        error: `Too many line items (>${MAX_LINES_PER_REQUEST}). The approval will still send — customers see the technical view instead of plain-English.`,
        cap: MAX_LINES_PER_REQUEST,
      },
      { status: 413 },
    )
  }
  if (stats === 'not-found') {
    return NextResponse.json({ error: 'Approval request not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, ...stats })
}

/**
 * Shared implementation called both by the route handler above AND
 * (server-to-server) from /api/approval-requests/[id]/send when the
 * operator clicks "Send".
 *
 * Returns:
 *   - 'cap-exceeded' if too many lines (logs to ai_activity_log)
 *   - 'not-found' if the approval doesn't exist or doesn't belong to the org
 *   - ExplainStats on success (some lines may have failed individually)
 */
export async function regenerateForApprovalRequest(args: {
  organization_id: string
  user_id?: string | null
  approval_request_id: string
  force?: boolean
}): Promise<ExplainStats | 'cap-exceeded' | 'not-found'> {
  const service = createServiceSupabase()

  // Fetch the approval + lines + aircraft context.
  const { data: ar } = await service
    .from('approval_requests')
    .select(`
      id, organization_id, aircraft_id,
      aircraft:aircraft_id (id, tail_number, make, model)
    `)
    .eq('id', args.approval_request_id)
    .eq('organization_id', args.organization_id)
    .maybeSingle()
  if (!ar) return 'not-found'

  const { data: lines } = await service
    .from('approval_line_items')
    .select('id, description, estimated_cost, labor_hours, parts_cost, ai_explanation_md, ai_explanation_generated_at')
    .eq('approval_request_id', args.approval_request_id)
    .order('sort_order', { ascending: true })

  const total = (lines ?? []).length

  if (total > MAX_LINES_PER_REQUEST) {
    await logCapExceeded(service, {
      organization_id: args.organization_id,
      user_id: args.user_id ?? null,
      scope: 'approval-line-explainer',
      entity_kind: 'approval_requests',
      entity_id: args.approval_request_id,
      reason: `${total} line items exceeds cap of ${MAX_LINES_PER_REQUEST}`,
    })
    return 'cap-exceeded'
  }

  const aircraftRow = ((ar as { aircraft?: unknown }).aircraft ?? null) as
    | { tail_number?: string | null; make?: string | null; model?: string | null }
    | null
  const tail = aircraftRow?.tail_number ?? null
  const makeModel = aircraftRow ? [aircraftRow.make, aircraftRow.model].filter(Boolean).join(' ') || null : null

  let generated = 0
  let skipped = 0
  let failed = 0
  let cost = 0

  for (const line of (lines ?? []) as Array<{
    id: string
    description: string
    estimated_cost: number
    labor_hours: number
    parts_cost: number
    ai_explanation_md: string | null
    ai_explanation_generated_at: string | null
  }>) {
    if (!args.force && line.ai_explanation_md && line.ai_explanation_generated_at) {
      skipped++
      continue
    }

    try {
      const out = await explainApprovalLine(service, {
        organization_id: args.organization_id,
        user_id: args.user_id ?? null,
        approval_request_id: args.approval_request_id,
        approval_line_item_id: line.id,
        description: line.description,
        estimated_cost: Number(line.estimated_cost ?? 0),
        labor_hours: Number(line.labor_hours ?? 0),
        parts_cost: Number(line.parts_cost ?? 0),
        tail_number: tail,
        aircraft_make_model: makeModel,
      })
      await service
        .from('approval_line_items')
        .update({
          ai_explanation_md: out.explanation_md,
          ai_explanation_generated_at: new Date().toISOString(),
          ai_explanation_model: out.model,
          ai_explanation_input_tokens: out.input_tokens,
          ai_explanation_output_tokens: out.output_tokens,
        })
        .eq('id', line.id)
      generated++
      cost += out.cost_usd_cents ?? 0
    } catch (e) {
      console.error('[regenerate-explanations] line failed:', line.id, e)
      failed++
      // Per-line failure: continue. Customer view falls back to
      // line.description if ai_explanation_md stays NULL.
    }
  }

  return {
    total_lines: total,
    generated,
    skipped,
    failed,
    cost_usd_cents: cost,
  }
}
