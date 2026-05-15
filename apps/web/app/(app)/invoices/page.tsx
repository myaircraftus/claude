// OWNER PERMISSIONS: Read-only. Can view invoices.
// Cannot: create or edit invoices.
import { Topbar } from '@/components/shared/topbar'
import { OpsTabStrip } from '@/components/ops/ops-tab-strip'
import { InvoiceWorkflowBoard } from '@/components/invoices/invoice-workflow-board'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const metadata = { title: 'Invoices' }

export default async function InvoicesRoute() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const [invoicesRes, workOrdersRes, estimatesRes, aircraftRes, customersRes] = await Promise.all([
    supabase
      .from('invoices')
      .select(`
        id, invoice_number, status, source_type, source_id, payment_status,
        invoice_date:issue_date, due_date, subtotal, tax_amount, fees_total, deposit_credit_total,
        total, amount_paid, payment_total, balance_due, signed_at, sent_at, created_at,
        aircraft:aircraft_id (id, tail_number, make, model),
        customer:customer_id (id, name, email),
        payee:payee_id (id, name, email),
        work_order:work_order_id (id, work_order_number, status),
        estimate:estimate_id (id, estimate_number, status)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('work_orders')
      .select(`
        id, work_order_number, status, aircraft_id, customer_id, total_amount, created_at,
        aircraft:aircraft_id (id, tail_number, make, model),
        lines:work_order_lines (*)
      `)
      .eq('organization_id', orgId)
      .in('status', ['open', 'in_progress', 'ready_for_signoff', 'closed', 'invoiced', 'paid'])
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('estimates')
      .select(`
        id, estimate_number, status, aircraft_id, customer_id, total, deposit_required, deposit_amount, created_at,
        aircraft:aircraft_id (id, tail_number, make, model),
        line_items:estimate_line_items (*)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model, serial_number, status')
      .eq('organization_id', orgId)
      .order('tail_number', { ascending: true })
      .limit(500),
    supabase
      .from('customers')
      .select('id, name, company, email, phone')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
      .limit(500),
  ])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Invoices' }]} />
      <OpsTabStrip active="invoices" />
      <InvoiceWorkflowBoard
        invoices={(invoicesRes.data ?? []) as any[]}
        workOrders={(workOrdersRes.data ?? []) as any[]}
        estimates={(estimatesRes.data ?? []) as any[]}
        aircraft={(aircraftRes.data ?? []) as any[]}
        customers={(customersRes.data ?? []) as any[]}
      />
    </div>
  )
}
