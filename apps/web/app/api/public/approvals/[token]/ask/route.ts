/**
 * POST /api/public/approvals/[token]/ask  (Spec 5.6)
 *
 * Customer-side "Ask a question about this work" handler. Public —
 * token is the auth (same model as the existing /respond route from 1.5).
 * Service-role Supabase reads bypass RLS while we manually validate the
 * token + status.
 *
 * Body: { question: string }
 * Response: { answer_md: string, model: string }
 *
 * Hard rate-limit: max 300 chars in question, max 5 questions per token
 * per hour (tracked via ai_activity_log scope/entity counts). Past that,
 * we return 429 with a "please wait" message.
 *
 * Failure mode: if the LLM call fails, we return 503 with a polite
 * fallback message — customer experience never shows raw stack traces.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { answerCustomerQuestion } from '@/lib/ai/explainers/approval-line'

export const dynamic = 'force-dynamic'

const MAX_QUESTION_LENGTH = 300
const RATE_LIMIT_PER_HOUR = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

interface ApprovalLineItemRow {
  description: string
  estimated_cost: number
  labor_hours: number
  parts_cost: number
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  let body: { question?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 })
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `Question is too long (max ${MAX_QUESTION_LENGTH} characters)` },
      { status: 400 },
    )
  }

  const service = createServiceSupabase()

  // Resolve the approval by token. Refuse drafts (404) and expired (410).
  const { data: ar } = await service
    .from('approval_requests')
    .select(`
      id, organization_id, status, expires_at, aircraft_id,
      aircraft:aircraft_id (tail_number, make, model)
    `)
    .eq('public_token', params.token)
    .maybeSingle()
  if (!ar) return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
  const approval = ar as {
    id: string
    organization_id: string
    status: string
    expires_at: string | null
    aircraft: { tail_number?: string | null; make?: string | null; model?: string | null } | null
  }
  if (approval.status === 'draft') {
    return NextResponse.json({ error: 'Approval not yet sent' }, { status: 404 })
  }
  if (approval.expires_at && Date.parse(approval.expires_at) < Date.now()) {
    return NextResponse.json({ error: 'Approval link has expired' }, { status: 410 })
  }

  // Per-token rate limit via ai_activity_log row count.
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
  const { count: recentAsks } = await service
    .from('ai_activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', approval.organization_id)
    .eq('scope', 'approval-customer-ask')
    .eq('entity_id', approval.id)
    .gte('created_at', since)
  if ((recentAsks ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { error: 'You\'ve asked a lot of questions on this approval recently. Please wait an hour or contact the shop directly.' },
      { status: 429 },
    )
  }

  // Pull line items for context.
  const { data: lines } = await service
    .from('approval_line_items')
    .select('description, estimated_cost, labor_hours, parts_cost')
    .eq('approval_request_id', approval.id)
    .order('sort_order', { ascending: true })

  const lineItems: ApprovalLineItemRow[] = ((lines ?? []) as ApprovalLineItemRow[]).map((l) => ({
    description: l.description,
    estimated_cost: Number(l.estimated_cost ?? 0),
    labor_hours: Number(l.labor_hours ?? 0),
    parts_cost: Number(l.parts_cost ?? 0),
  }))

  const aircraft = approval.aircraft
  const makeModel = aircraft ? [aircraft.make, aircraft.model].filter(Boolean).join(' ') || null : null

  try {
    const out = await answerCustomerQuestion(service, {
      organization_id: approval.organization_id,
      approval_request_id: approval.id,
      question,
      line_items: lineItems,
      tail_number: aircraft?.tail_number ?? null,
      aircraft_make_model: makeModel,
    })
    return NextResponse.json({
      answer_md: out.answer_md,
      model: out.model,
    })
  } catch (e) {
    console.error('[approvals/ask] LLM error:', e)
    return NextResponse.json(
      {
        error: "We couldn't reach our AI assistant right now. Please try again in a minute, or reach out to the shop directly with your question.",
      },
      { status: 503 },
    )
  }
}
