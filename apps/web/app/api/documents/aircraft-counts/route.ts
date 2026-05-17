/**
 * GET /api/documents/aircraft-counts
 *
 * Returns the count of uploaded (non-deleted) documents per aircraft for the
 * caller's organization: { counts: { [aircraftId]: number } }.
 *
 * Used by the Ask Logbook AI surface to show a "no documents uploaded for
 * this aircraft" state when a specific aircraft with zero documents is
 * selected — so a shop user knows the owner hasn't uploaded anything yet.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('documents')
    .select('aircraft_id')
    .eq('organization_id', ctx.organizationId)
    .not('aircraft_id', 'is', null)
    .is('deleted_at', null)
    .limit(10000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const id = (row as { aircraft_id: string | null }).aircraft_id
    if (id) counts[id] = (counts[id] ?? 0) + 1
  }

  return NextResponse.json({ counts })
}
