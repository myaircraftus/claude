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

export default async function InvoicesRoute() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const { persona } = await getCurrentPersona()
  const isOwner = persona === 'owner'
  const orgId = membership.organization_id

  const [invoicesRes, workOrdersRes] = await Promise.all([
    supabase
      .from('invoices')
      .select(`
        id, invoice_number, status, total, balance_due, due_date, issue_date, created_at,
        aircraft:aircraft_id (id, tail_number),
        customer:customer_id (id, name)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(300),
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

  const now = Date.now()
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  const isUnpaid = (s: string) => s !== 'paid' && s !== 'void' && s !== 'writeoff'

  const stats = {
    total_invoices: invoices.length,
    total_outstanding: invoices
      .filter((i) => isUnpaid(i.status))
      .reduce((s, i) => s + Number(i.balance_due ?? 0), 0),
    overdue_count: invoices.filter(
      (i) => isUnpaid(i.status) && i.due_date && new Date(i.due_date).getTime() < now,
    ).length,
    paid_this_month: invoices
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
      />
    </div>
  )
}
