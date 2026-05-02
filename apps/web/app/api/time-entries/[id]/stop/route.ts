/**
 * POST /api/time-entries/[id]/stop (Spec 2.3)
 *
 * Clock out — closes the entry by setting end_time = now. The /stop
 * endpoint is the technician-facing path: it refuses to close someone
 * else's entry. Owners/admins should use PATCH directly to correct
 * other people's open entries.
 *
 * Body (optional): { notes?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { clockOut } from '@/lib/timeclock/clock'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any = {}
  try {
    body = await req.json().catch(() => ({}))
  } catch { /* body optional */ }

  const supabase = createServerSupabase()
  const result = await clockOut(supabase, ctx.organizationId, ctx.user.id, params.id, {
    notes: typeof body?.notes === 'string' ? body.notes : undefined,
  })
  if (!result.ok) {
    const status = result.error && /not found/i.test(result.error)
      ? 404
      : (result.error && /already closed|own entry/i.test(result.error) ? 409 : 400)
    return NextResponse.json({ error: result.error || 'Clock-out failed' }, { status })
  }
  return NextResponse.json({ entry: result.entry })
}
