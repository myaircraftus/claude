/**
 * /api/public/support/submit — UNAUTHENTICATED ticket submission.
 *
 * Phase 16 Sprint 16.2. Used by the public /support form on the marketing
 * site. Honeypot field rejects bot fills; service-role client used for
 * the insert because there's no auth.uid() to satisfy the RLS
 * authenticated-insert policy.
 *
 * source = 'web_form'. organization_id is resolved from the optional
 * org slug; if not provided / not found, the ticket is created with
 * organization_id = NULL (admin can route later).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { createTicket, isValidTicketCategory } from '@/lib/support/tickets'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  // Honeypot — if the bot fills the hidden field, drop the request silently
  // (return 200 so they don't retry).
  if (body.website && typeof body.website === 'string' && body.website.length > 0) {
    return NextResponse.json({ ok: true, ticket_number: 'TKT-DROPPED' })
  }

  if (!body.email || !body.subject || !body.body) {
    return NextResponse.json(
      { error: 'email, subject, and body are required' },
      { status: 400 },
    )
  }

  // Optional org slug → org_id resolution.
  let organizationId: string | null = null
  if (typeof body.organization_slug === 'string' && body.organization_slug.trim()) {
    const service = createServiceSupabase()
    const { data: org } = await service
      .from('organizations')
      .select('id')
      .eq('slug', body.organization_slug.trim())
      .maybeSingle()
    organizationId = (org as { id: string } | null)?.id ?? null
  }

  const category = isValidTicketCategory(body.category) ? body.category : undefined

  const service = createServiceSupabase()
  const result = await createTicket(
    service,
    {
      organization_id: organizationId,
      subject: body.subject,
      body: body.body,
      submitter_email: body.email,
      category,
    },
    'web_form',
  )

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json(
    {
      ticket_number: result.ticket.ticket_number,
      status: result.ticket.status,
      // Magic link the customer can use to view this ticket without
      // creating an account. Honors the access_token policy in
      // getTicketByNumber.
      view_url: `/support/tickets/${result.ticket.ticket_number}?token=${result.ticket.access_token}`,
    },
    { status: 201 },
  )
}
