/**
 * POST /api/tool-checkouts/[id]/return
 *      Body: { condition?: 'ok'|'damaged'|'needs-recalibration', notes? }
 *
 * Closes an open tool checkout. Sets tool status accordingly:
 *   ok                  → available
 *   damaged             → out-of-service
 *   needs-recalibration → out-for-calibration
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { returnTool } from '@/lib/tools/queries'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { condition?: unknown; notes?: unknown }
  const cond = body.condition === 'ok' || body.condition === 'damaged' || body.condition === 'needs-recalibration'
    ? body.condition
    : 'ok'

  const result = await returnTool(createServerSupabase(), {
    organizationId: ctx.organizationId,
    checkoutId: params.id,
    condition: cond,
    notes: typeof body.notes === 'string' ? body.notes : null,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
  return NextResponse.json({ checkout: result.checkout })
}
