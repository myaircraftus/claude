import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

// Aggregated owner dashboard endpoint — collapses the aircraft list, open
// squawks, upcoming document expirations, and pending estimates into ONE
// request whose sub-queries run concurrently. 1 request + 1 parallel DB
// fan-out instead of 4 sequential round-trips.
export const dynamic = 'force-dynamic'

const LIST_CAP = 25

// Squawk statuses considered still-open / actionable — the complement of
// the closed set (resolved / closed_* / archived) in the squawks_status_check
// constraint (20260514152339_squawks_discrepancy_intake.sql).
const OPEN_SQUAWK_STATUSES = [
  'draft',
  'open',
  'acknowledged',
  'needs_review',
  'high_priority',
  'routed_to_estimate',
  'awaiting_owner_approval',
  'added_to_work_order',
  'in_work_order',
  'in_progress',
  'waiting_for_parts',
  'deferred',
]
const PENDING_ESTIMATE_STATUSES = ['draft', 'sent', 'awaiting_approval', 'awaiting_deposit']

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  // Upcoming expirations are backed by the document_expirations table
  // (see supabase/migrations/20260516160000_expiration_tracking_tables.sql).
  // Ordered by soonest expiration_date; rows with no date sort last.
  const [aircraftRes, openSquawksRes, upcomingExpirationsRes, pendingEstimatesRes] =
    await Promise.all([
      supabase
        .from('aircraft')
        .select('id, tail_number, make, model, year')
        .eq('organization_id', orgId)
        .eq('is_archived', false)
        .order('tail_number'),
      supabase
        .from('squawks')
        .select(`
          id, title, severity, status, created_at,
          aircraft:aircraft_id (id, tail_number)
        `)
        .eq('organization_id', orgId)
        .in('status', OPEN_SQUAWK_STATUSES)
        .order('created_at', { ascending: false })
        .limit(LIST_CAP),
      supabase
        .from('document_expirations')
        .select(`
          id, scope, document_name, document_type, expiration_date, aircraft_id,
          aircraft:aircraft_id (id, tail_number)
        `)
        .eq('organization_id', orgId)
        .order('expiration_date', { ascending: true, nullsFirst: false })
        .limit(LIST_CAP),
      supabase
        .from('estimates')
        .select(`
          id, estimate_number, status, total, valid_until, created_at,
          aircraft:aircraft_id (id, tail_number)
        `)
        .eq('organization_id', orgId)
        .in('status', PENDING_ESTIMATE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(LIST_CAP),
    ])

  return NextResponse.json({
    aircraft: aircraftRes.data ?? [],
    open_squawks: openSquawksRes.data ?? [],
    upcoming_expirations: upcomingExpirationsRes.data ?? [],
    pending_estimates: pendingEstimatesRes.data ?? [],
  })
}
