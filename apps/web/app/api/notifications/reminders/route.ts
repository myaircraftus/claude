/**
 * POST /api/notifications/reminders (Spec 0.4)
 *
 * Schedule one or more reminders for an entity. Body: ScheduleReminderInput
 * (see lib/notifications/types.ts).
 *
 * Used by both: real modules (Documents, Compliance, Inspections) calling
 * server-side via lib/notifications/reminders.ts:scheduleReminders(), and
 * the acceptance harness which exercises the 30/14/7-day fan-out.
 *
 * Permission: mechanic+ in the active org. RLS is also enforced.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { scheduleReminders } from '@/lib/notifications/reminders'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole } from '@/types'

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body?.entity_kind || !body?.entity_id || !body?.anchor || !Array.isArray(body?.specs)) {
    return NextResponse.json(
      { error: 'entity_kind, entity_id, anchor, specs[] required' },
      { status: 400 },
    )
  }
  if (!body?.category || !body?.title || !body?.body) {
    return NextResponse.json({ error: 'category, title, body required' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const result = await scheduleReminders(supabase, {
    organization_id: ctx.organizationId,
    user_id: body.user_id ?? null,
    entity_kind: String(body.entity_kind),
    entity_id: String(body.entity_id),
    anchor: String(body.anchor),
    specs: body.specs,
    category: body.category,
    title: body.title,
    body: body.body,
    link: body.link ?? null,
  })

  return NextResponse.json({ ok: result.errors.length === 0, ...result })
}
