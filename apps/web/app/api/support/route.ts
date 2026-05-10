import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'

/**
 * Phase 15.5 Task 1.5 — schema-collision shim.
 *
 * Migration 109 (Phase 16 Sprint 16.1) reshaped `support_tickets` from
 * the legacy 11-text-column scaffold into the AI-ops-spine enum schema.
 * This route was the legacy GET/POST surface for in-app support tickets.
 *
 * Sprint 16.2 will rewrite this with the full ticket service
 * (lib/support/tickets.ts, AI triage, etc.). Until then we keep the
 * route compiling + functional with the new schema:
 *
 *   GET  → returns the org's tickets in a shape the legacy
 *          SupportDialog UI doesn't actually consume (it's a fire-and-
 *          forget submit). Empty array on the new (empty) table is fine.
 *   POST → maps the legacy {subject, description, type, severity}
 *          payload onto the new (subject, body, category, severity)
 *          schema with sensible defaults so the in-app help dialog
 *          still works.
 */

const LEGACY_TYPE_TO_CATEGORY: Record<string, string> = {
  technical: 'technical',
  billing: 'billing',
  feature_request: 'feature_request',
  bug: 'bug',
  account: 'account',
  general: 'other',
}

export async function GET(req: NextRequest) {
  const context = await resolveRequestOrgContext(req)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, category, severity, status, subject, body, created_at, updated_at')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tickets: data ?? [] })
}

export async function POST(req: NextRequest) {
  const context = await resolveRequestOrgContext(req)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.subject || !body?.description) {
    return NextResponse.json({ error: 'subject and description are required' }, { status: 400 })
  }

  // Email is required by the new schema; fall back to user.email.
  const submitterEmail = context.user.email
  if (!submitterEmail) {
    return NextResponse.json({ error: 'submitter email missing on user' }, { status: 400 })
  }

  const category = LEGACY_TYPE_TO_CATEGORY[body.type as string] ?? 'other'

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      organization_id: context.organizationId,
      submitter_user_id: context.user.id,
      submitter_email: submitterEmail,
      source: 'in_app',
      category,
      severity: 'P2', // legacy 'medium' default; AI triage will re-rank in Sprint 16.3
      status: 'new',
      subject: body.subject,
      body: body.description,
    })
    .select('id, ticket_number, category, severity, status, subject, body, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
