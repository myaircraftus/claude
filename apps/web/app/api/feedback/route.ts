/**
 * /api/feedback — Phase 16 Sprint 16.9 rewrite.
 *
 * Reads/writes the new feedback_items table (mig 109 ops-spine).
 * Accepts the legacy {message, page} payload from the existing
 * components/shared/feedback-dialog.tsx + the new richer
 * {type, score, body, sentiment, source_page} from the floating
 * widget. Maps legacy fields onto the new schema at the boundary.
 *
 * Status values map: legacy 'open' → new 'new'.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'

const VALID_TYPES = new Set(['thumbs', 'nps', 'csat', 'feature_request', 'praise', 'complaint'])
const VALID_SENTIMENTS = new Set(['positive', 'neutral', 'negative'])

export async function GET(req: NextRequest) {
  const context = await resolveRequestOrgContext(req)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('feedback_items')
    .select('id, type, score, body, sentiment, source_page, status, created_at, submitter_user_id')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Alias new column names back to the legacy {message, page, status='open'}
  // shape so any UI still consuming the GET keeps rendering. New callers
  // should use the rich shape directly.
  const feedback = (data ?? []).map((row: any) => ({
    id: row.id,
    message: row.body,
    page: row.source_page,
    status: row.status === 'new' ? 'open' : row.status,
    created_at: row.created_at,
    user_id: row.submitter_user_id,
    // Pass-through for new callers:
    type: row.type,
    score: row.score,
    sentiment: row.sentiment,
  }))
  return NextResponse.json({ feedback })
}

export async function POST(req: NextRequest) {
  const context = await resolveRequestOrgContext(req)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })

  // Three legal payload shapes:
  //   1. Legacy: { message, page }                     → type='feature_request'
  //   2. Thumbs: { type:'thumbs', score:0|1, body? }
  //   3. Rich:   { type, score?, body?, sentiment?, source_page?, related_ticket_id? }
  const isLegacy = typeof body.message === 'string' && !body.type

  let type: string
  let bodyText: string | null
  let score: number | null = null
  let sourcePage: string | null = null
  let sentiment = 'neutral'
  let relatedTicketId: string | null = null

  if (isLegacy) {
    if (!body.message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }
    type = 'feature_request'
    bodyText = String(body.message).slice(0, 4000)
    sourcePage = typeof body.page === 'string' ? body.page.slice(0, 500) : null
  } else {
    if (!VALID_TYPES.has(body.type)) {
      return NextResponse.json({ error: 'invalid type' }, { status: 400 })
    }
    type = body.type
    bodyText = typeof body.body === 'string' ? body.body.slice(0, 4000) : null
    sourcePage = typeof body.source_page === 'string' ? body.source_page.slice(0, 500) : null
    relatedTicketId = typeof body.related_ticket_id === 'string' ? body.related_ticket_id : null

    if (type === 'nps') {
      const n = Number(body.score)
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        return NextResponse.json({ error: 'NPS score must be integer 1..10' }, { status: 400 })
      }
      score = n
    } else if (type === 'csat') {
      const n = Number(body.score)
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        return NextResponse.json({ error: 'CSAT score must be integer 1..5' }, { status: 400 })
      }
      score = n
    } else if (typeof body.score === 'number' && Number.isInteger(body.score)) {
      score = Math.max(0, Math.min(10, body.score))
    }

    if (typeof body.sentiment === 'string' && VALID_SENTIMENTS.has(body.sentiment)) {
      sentiment = body.sentiment
    } else {
      // Auto-derive from type/score.
      if (type === 'praise') sentiment = 'positive'
      else if (type === 'complaint') sentiment = 'negative'
      else if (type === 'thumbs' && score === 1) sentiment = 'positive'
      else if (type === 'thumbs' && score === 0) sentiment = 'negative'
      else if (type === 'nps' && score != null) {
        sentiment = score >= 9 ? 'positive' : score <= 6 ? 'negative' : 'neutral'
      } else if (type === 'csat' && score != null) {
        sentiment = score >= 4 ? 'positive' : score <= 2 ? 'negative' : 'neutral'
      }
    }
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('feedback_items')
    .insert({
      organization_id: context.organizationId,
      submitter_user_id: context.user.id,
      type,
      score,
      body: bodyText,
      sentiment,
      source_page: sourcePage,
      related_ticket_id: relatedTicketId,
      status: 'new',
    })
    .select('id, type, score, body, sentiment, source_page, status, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Legacy callers expect {id, message, page, status, created_at}.
  if (isLegacy) {
    const d = data as any
    return NextResponse.json({
      id: d.id,
      message: d.body,
      page: d.source_page,
      status: 'open',
      created_at: d.created_at,
    }, { status: 201 })
  }
  return NextResponse.json(data, { status: 201 })
}
