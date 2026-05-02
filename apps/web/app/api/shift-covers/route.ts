/**
 * GET /api/shift-covers — list cover requests for the active org.
 * Optional ?status=open|claimed|approved|rejected (repeatable).
 *
 * Spec 2.5.1.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { ShiftCover, ShiftCoverStatus } from '@/types'

const ALLOWED_STATUSES: ShiftCoverStatus[] = ['open', 'claimed', 'approved', 'rejected']

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { searchParams } = new URL(req.url)

  let query = supabase
    .from('shift_covers')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(200)

  const statuses = searchParams.getAll('status').filter((s): s is ShiftCoverStatus =>
    (ALLOWED_STATUSES as string[]).includes(s),
  )
  if (statuses.length > 0) query = query.in('status', statuses)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ covers: (data ?? []) as ShiftCover[] })
}
