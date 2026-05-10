/**
 * /api/support — authenticated in-app help drawer.
 *
 * Phase 16 Sprint 16.2 — full rewrite of the schema-collision shim that
 * Phase 15.5 Task 1 left in place. Now uses the Phase 16 ops-spine
 * support_tickets schema directly via lib/support/tickets.ts.
 *
 *   GET  → list tickets visible to the caller's org (RLS + RLS submitter
 *          policy — admin sees all, org member sees own org, submitter
 *          sees their own across orgs).
 *   POST → create a new ticket. submitter_email defaults to user.email.
 *          source = 'in_app'. AI triage worker (Sprint 16.3) picks it up
 *          on next tick.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import {
  createTicket,
  listTicketsForOrg,
  isValidTicketCategory,
} from '@/lib/support/tickets'

export async function GET(req: NextRequest) {
  const context = await resolveRequestOrgContext(req)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  try {
    const { tickets, total } = await listTicketsForOrg(supabase, context.organizationId, {
      limit: 200,
    })
    return NextResponse.json({ tickets, total })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list tickets' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  const context = await resolveRequestOrgContext(req)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const submitterEmail = (body.submitter_email as string | undefined) ?? context.user.email
  if (!submitterEmail) {
    return NextResponse.json({ error: 'No email available for the submitter' }, { status: 400 })
  }

  const category = isValidTicketCategory(body.category) ? body.category : undefined

  const supabase = createServerSupabase()
  const result = await createTicket(
    supabase,
    {
      organization_id: context.organizationId,
      subject: body.subject,
      body: body.body ?? body.description, // legacy callers still send 'description'
      submitter_email: submitterEmail,
      submitter_user_id: context.user.id,
      category,
      tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : [],
      related_doc_id: body.related_doc_id ?? null,
      related_aircraft_id: body.related_aircraft_id ?? null,
    },
    'in_app',
  )

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json(
    {
      id: result.ticket.id,
      ticket_number: result.ticket.ticket_number,
      status: result.ticket.status,
      created_at: result.ticket.created_at,
    },
    { status: 201 },
  )
}
