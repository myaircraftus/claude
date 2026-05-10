/**
 * /api/admin/support — platform-admin support inbox + status mutations.
 *
 * Phase 16 Sprint 16.2 — full rewrite of the schema-collision shim that
 * Phase 15.5 Task 1 left in place. Now uses lib/support/tickets.ts and
 * the Phase 16 ops-spine schema directly.
 *
 *   GET   → list ALL tickets (admin only).
 *   PATCH → update status / resolution_summary / admin_assigned_to.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import {
  listTicketsForAdmin,
  updateTicketStatus,
  isValidTicketStatus,
} from '@/lib/support/tickets'

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

export async function GET(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if ('error' in guard) return guard.error

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const severity = url.searchParams.get('severity')
  const category = url.searchParams.get('category')
  const orgId = url.searchParams.get('organization_id')
  const q = url.searchParams.get('q')
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 200)))
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0))

  const service = createServiceSupabase()
  try {
    const { tickets, total } = await listTicketsForAdmin(service, {
      status: status ? (status.split(',') as any) : undefined,
      severity: severity ? (severity.split(',') as any) : undefined,
      category: category ? (category.split(',') as any) : undefined,
      organization_id: orgId ?? undefined,
      q: q ?? undefined,
      limit,
      offset,
    })
    return NextResponse.json({ tickets, total })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list tickets' },
      { status: 500 },
    )
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if ('error' in guard) return guard.error

  const body = await req.json().catch(() => null)
  if (!body?.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  // Status update path.
  if (body.status !== undefined) {
    if (!isValidTicketStatus(body.status)) {
      return NextResponse.json({ error: `invalid status: ${body.status}` }, { status: 400 })
    }
    const service = createServiceSupabase()
    const result = await updateTicketStatus(service, body.id, body.status, {
      resolution_summary: typeof body.resolution_summary === 'string' ? body.resolution_summary : undefined,
      admin_assigned_to: body.admin_assigned_to !== undefined ? body.admin_assigned_to : undefined,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true, id: body.id, status: body.status })
  }

  // Otherwise nothing to update.
  return NextResponse.json({ error: 'no update fields provided' }, { status: 400 })
}
