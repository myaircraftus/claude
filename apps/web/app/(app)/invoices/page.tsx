// OWNER PERMISSIONS: Read-only. Can view invoices. Cannot create or edit.
//
// Clean list view. The 7-step workflow documentation that used to render
// inline (InvoiceWorkflowBoard) is gone — this page now shows only the
// invoice list. Creating an invoice happens via the "New Invoice" dialog
// on InvoicesList (blank, or from a work order).
import { Topbar } from '@/components/shared/topbar'
import { OpsTabStrip } from '@/components/ops/ops-tab-strip'
import { InvoicesList } from './invoices-list'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'

export const metadata = { title: 'Invoices' }

// Server-side pagination: 25 rows/page via ?page=. The list previously
// loaded up to 300 invoices for the org on every render. Stats are still
// computed over the whole org, but via a slim status/amount-only projection
// rather than hydrating 300 fully-joined rows into the client.
const PAGE_SIZE = 25

export default async function InvoicesRoute({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  const { supabase, profile, membership } = await requireAppServerSession()
  const { persona } = await getCurrentPersona()
  const isOwner = persona === 'owner'
  const orgId = membership.organization_id

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  const [invoicesRes, statRowsRes, workOrdersRes] = await Promise.all([
    supabase
      .from('invoices')
      .select(`
        id, invoice_number, status, total, balance_due, due_date, issue_date, created_at,
        aircraft:aircraft_id (id, tail_number),
        customer:customer_id (id, name)
      `, { count: 'exact' })
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
    // Slim org-wide projection for the stat cards — no joins, only the
    // columns the four stats need.
    supabase
      .from('invoices')
      .select('status, total, balance_due, due_date, issue_date, created_at')
      .eq('organization_id', orgId),
    supabase
      .from('work_orders')
      .select('id, work_order_number, status, total_amount, aircraft:aircraft_id (tail_number)')
      .eq('organization_id', orgId)
      .in('status', ['open', 'in_progress', 'ready_for_signoff', 'closed'])
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const invoices = ((invoicesRes.data ?? []) as any[]).map((i) => ({
    ...i,
    aircraft: Array.isArray(i.aircraft) ? i.aircraft[0] ?? null : i.aircraft ?? null,
    customer: Array.isArray(i.customer) ? i.customer[0] ?? null : i.customer ?? null,
  }))

  const totalCount = invoicesRes.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const now = Date.now()
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  const isUnpaid = (s: string) => s !== 'paid' && s !== 'void' && s !== 'writeoff'

  const statRows = (statRowsRes.data ?? []) as any[]
  const stats = {
    total_invoices: totalCount,
    total_outstanding: statRows
      .filter((i) => isUnpaid(i.status))
      .reduce((s, i) => s + Number(i.balance_due ?? 0), 0),
    overdue_count: statRows.filter(
      (i) => isUnpaid(i.status) && i.due_date && new Date(i.due_date).getTime() < now,
    ).length,
    paid_this_month: statRows
      .filter((i) => i.status === 'paid' && new Date(i.issue_date ?? i.created_at) >= monthStart)
      .reduce((s, i) => s + Number(i.total ?? 0), 0),
  }

  const workOrders = ((workOrdersRes.data ?? []) as any[]).map((w) => ({
    ...w,
    aircraft: Array.isArray(w.aircraft) ? w.aircraft[0] ?? null : w.aircraft ?? null,
    total: Number(w.total_amount ?? 0),
  }))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Invoices' }]} />
      <OpsTabStrip active="invoices" />
      <InvoicesList
        initialInvoices={invoices}
        stats={stats}
        workOrders={workOrders}
        isOwner={isOwner}
        page={page}
        totalPages={totalPages}
      />
    </div>
  )
}
