import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

// Aggregated shop dashboard endpoint — collapses four separate list calls
// (work orders, estimates, invoices, squawks) into ONE request whose
// sub-queries run concurrently. Cuts the dashboard from 4 sequential
// round-trips to 1 request + 1 parallel DB fan-out.
export const dynamic = 'force-dynamic'

const LIST_CAP = 25

// Statuses that count as "open"/"pending"/"unpaid" for the headline lists.
const OPEN_WORK_ORDER_STATUSES = ['open', 'in_progress', 'awaiting_parts', 'ready_for_signoff']
const PENDING_ESTIMATE_STATUSES = ['draft', 'sent', 'awaiting_approval', 'awaiting_deposit']
const UNPAID_INVOICE_STATUSES = ['draft', 'sent', 'pending', 'partially_paid', 'overdue']

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const [openWorkOrdersRes, pendingEstimatesRes, unpaidInvoicesRes, recentSquawksRes] =
    await Promise.all([
      supabase
        .from('work_orders')
        .select(`
          id, work_order_number, status, total_amount, opened_at, created_at, updated_at,
          aircraft:aircraft_id (id, tail_number)
        `)
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .in('status', OPEN_WORK_ORDER_STATUSES)
        .order('updated_at', { ascending: false })
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
      supabase
        .from('invoices')
        .select(`
          id, invoice_number, status, total, balance_due, due_date, created_at,
          aircraft:aircraft_id (id, tail_number)
        `)
        .eq('organization_id', orgId)
        .in('status', UNPAID_INVOICE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(LIST_CAP),
      supabase
        .from('squawks')
        .select(`
          id, title, severity, status, created_at,
          aircraft:aircraft_id (id, tail_number)
        `)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(LIST_CAP),
    ])

  return NextResponse.json({
    open_work_orders: openWorkOrdersRes.data ?? [],
    pending_estimates: pendingEstimatesRes.data ?? [],
    unpaid_invoices: unpaidInvoicesRes.data ?? [],
    recent_squawks: recentSquawksRes.data ?? [],
  })
}
