/**
 * /api/webhooks/support-email — UNAUTHENTICATED inbound email parser (mock for v1).
 *
 * Phase 16 Sprint 16.2. Endpoint accepts a JSON envelope shaped to mimic
 * SendGrid Inbound Parse / Postmark inbound webhooks. Real provider
 * wiring is deferred — see docs/runbooks/email-ingestion.md.
 *
 * Envelope:
 *   {
 *     "from":    "customer@example.com",
 *     "subject": "Help with my logbook",
 *     "text":    "...plain body...",
 *     "html":    "...optional html body...",
 *     "attachments": [...optional...]
 *   }
 *
 * Auth: this route is meant to receive webhook calls from a real email
 * provider. For v1 (no provider wired) the route accepts unauth but
 * gates behind a shared secret env var SUPPORT_EMAIL_WEBHOOK_SECRET to
 * keep random POSTers from creating tickets. If the env var isn't set,
 * the endpoint returns 503 to make the missing config obvious.
 *
 * source = 'email'. organization_id resolved from sender email's
 * /api/support → org_membership lookup; null if the sender isn't
 * known to any org.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { createTicket } from '@/lib/support/tickets'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.SUPPORT_EMAIL_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'SUPPORT_EMAIL_WEBHOOK_SECRET not configured' },
      { status: 503 },
    )
  }
  const presented = req.headers.get('x-webhook-secret') ?? req.nextUrl.searchParams.get('secret')
  if (presented !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const fromEmail = typeof body.from === 'string' ? body.from.trim() : ''
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const textBody = typeof body.text === 'string' ? body.text : (typeof body.html === 'string' ? body.html : '')

  if (!fromEmail || !subject || !textBody) {
    return NextResponse.json(
      { error: 'from, subject, and text/html are required' },
      { status: 400 },
    )
  }

  const service = createServiceSupabase()

  // Best-effort: resolve sender → user_profiles → organization_id.
  let organizationId: string | null = null
  let submitterUserId: string | null = null
  try {
    const { data: profile } = await service
      .from('user_profiles')
      .select('id')
      .eq('email', fromEmail.toLowerCase())
      .maybeSingle()
    if (profile?.id) {
      submitterUserId = profile.id
      const { data: membership } = await service
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', profile.id)
        .not('accepted_at', 'is', null)
        .limit(1)
        .maybeSingle()
      organizationId = (membership as { organization_id: string } | null)?.organization_id ?? null
    }
  } catch { /* fall through to null/null */ }

  const result = await createTicket(
    service,
    {
      organization_id: organizationId,
      subject,
      body: textBody,
      submitter_email: fromEmail,
      submitter_user_id: submitterUserId,
      category: 'other',
    },
    'email',
  )

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json(
    {
      ticket_number: result.ticket.ticket_number,
      status: result.ticket.status,
    },
    { status: 201 },
  )
}
