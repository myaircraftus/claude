/**
 * POST /api/notifications/reminders/tick (Spec 0.4)
 *
 * Run the due-reminder sweep for the user's active org. Used by:
 *   - the acceptance harness (after seeding past-due schedules)
 *   - dev tooling
 *   - a future cron entry in vercel.json (TODO)
 *
 * Idempotent — schedules already fired are skipped via `fired_at IS NULL`.
 * Returns: { ok, ticked: TickRemindersResult }
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { tickReminders } from '@/lib/notifications/reminders'

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const ticked = await tickReminders(supabase, ctx.organizationId)
  return NextResponse.json({ ok: true, ticked })
}
