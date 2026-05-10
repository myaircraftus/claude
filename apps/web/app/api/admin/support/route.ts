import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

/**
 * Phase 15.5 Task 1.5 — schema-collision shim.
 *
 * Sprint 16.2 will rewrite the admin support inbox against the new
 * Phase 16 schema (with AI triage, escalation, severity routing, etc.).
 * Until then this route reads from the new table with the new column
 * names. The legacy SupportTable consumer expects old field names, so
 * the GET response aliases new → old at the boundary so the UI keeps
 * compiling. PATCH maps legacy 'open|triaged|in_progress' to the new
 * status enum values where applicable, and ignores unrecognized inputs
 * rather than 500ing.
 */

async function requirePlatformAdmin() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user }
}

// Legacy → new status enum. Anything unmapped is left alone so we don't
// silently mutate state into garbage.
const LEGACY_STATUS_MAP: Record<string, string> = {
  open: 'new',
  triaged: 'awaiting_admin',
  in_progress: 'awaiting_admin',
  resolved: 'resolved',
  closed: 'closed',
}

export async function GET(_req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (guard.error) return guard.error

  const service = createServiceSupabase()
  const { data, error } = await service
    .from('support_tickets')
    .select(
      'id, category, severity, status, subject, body, created_at, updated_at, organization_id, organizations(name), submitter_user_id, user_profiles!support_tickets_submitter_user_id_fkey(full_name, email)'
    )
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Alias new column names → the legacy shape SupportTable consumes.
  const tickets = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    type: row.category, // SupportTable shows row.type as a generic label
    severity: row.severity,
    status: row.status,
    subject: row.subject,
    description: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
    organization_id: row.organization_id,
    organizations: row.organizations,
    user_id: row.submitter_user_id,
    user_profiles: row.user_profiles,
  }))
  return NextResponse.json({ tickets })
}

export async function PATCH(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (guard.error) return guard.error

  const body = await req.json().catch(() => null)
  if (!body?.id || !body?.status) {
    return NextResponse.json({ error: 'id and status required' }, { status: 400 })
  }

  // The SupportTable dropdown still uses legacy values; map them.
  const newStatus = LEGACY_STATUS_MAP[body.status as string]
  if (!newStatus) {
    return NextResponse.json({ error: `unsupported status: ${body.status}` }, { status: 400 })
  }

  const service = createServiceSupabase()
  const { data, error } = await service
    .from('support_tickets')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', body.id)
    .select('id, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id, status: data.status })
}
