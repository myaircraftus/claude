/**
 * GET /api/me/clock-state
 *
 * Returns the current user's open ClockEvent (if any). Powers the
 * top-bar ClockInWidget. Polls every 30s when widget is mounted.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentClockState } from '@/lib/clock/queries'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const event = await getCurrentClockState(createServerSupabase(), ctx.organizationId, ctx.user.id)
  return NextResponse.json({ event })
}
