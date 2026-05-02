/**
 * POST /api/notifications/dispatch (Spec 0.4)
 *
 * Send a notification. Used by:
 *   - The acceptance harness (verifies dispatch + preferences)
 *   - Server-side orchestrator code (which usually calls sendNotification()
 *     directly without going through HTTP)
 *   - Dev tooling
 *
 * Permission: any authenticated org member can dispatch to *themselves*; only
 * mechanic+ can dispatch to other users / 'all-org-members'. Stops a viewer
 * from spamming the org via this route.
 *
 * Body: DispatchInput (see lib/notifications/types.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { sendNotification } from '@/lib/notifications/dispatch'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole } from '@/types'

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body?.category || !body?.title || !body?.body) {
    return NextResponse.json({ error: 'category, title, body required' }, { status: 400 })
  }

  const targetUser = body.user_id ?? ctx.user.id
  const isFanout = targetUser === 'all-org-members'
  const isOther  = !isFanout && targetUser !== ctx.user.id

  if ((isFanout || isOther) && !MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json(
      { error: 'Only mechanic+ can dispatch to other users' },
      { status: 403 },
    )
  }

  const supabase = createServerSupabase()
  const result = await sendNotification(supabase, {
    organization_id: ctx.organizationId,
    user_id: targetUser,
    category: body.category,
    title: body.title,
    body: body.body,
    link: body.link ?? null,
    channels: Array.isArray(body.channels) ? body.channels : undefined,
    source_card_id: body.source_card_id ?? null,
    source_kind: body.source_kind ?? null,
    source_id: body.source_id ?? null,
  })

  return NextResponse.json({ ok: true, result })
}
