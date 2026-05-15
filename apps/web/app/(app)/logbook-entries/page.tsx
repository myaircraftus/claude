import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { OpsTabStrip } from '@/components/ops/ops-tab-strip'
import { LogbookWorkflowBoard } from '@/components/logbook/logbook-workflow-board'

export const metadata = { title: 'Logbook Entries' }

export default async function LogbookEntriesPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const [entriesRes, workOrdersRes, aircraftRes] = await Promise.all([
    supabase
      .from('logbook_entries')
      .select(`
        id, aircraft_id, work_order_id, entry_type, entry_date, status, signed_at, created_at,
        hobbs_in, hobbs_out, tach_time, total_time, description,
        logbook_type, target_logbook, source_type, source_id, source_references,
        ai_review_status, owner_visible, revision_number, signature_certificate_id,
        aircraft:aircraft_id (id, tail_number, make, model),
        work_order:work_order_id (id, work_order_number, status)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('work_orders')
      .select(`
        id, work_order_number, status, aircraft_id, customer_id,
        complaint, discrepancy, findings, corrective_action, customer_visible_notes,
        total_amount, opened_at, closed_at, created_at,
        aircraft:aircraft_id (id, tail_number, make, model),
        lines:work_order_lines (*),
        checklist:work_order_checklist_items (*)
      `)
      .eq('organization_id', orgId)
      .in('status', ['open', 'in_progress', 'ready_for_signoff', 'closed', 'invoiced', 'paid'])
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model, serial_number, status')
      .eq('organization_id', orgId)
      .order('tail_number', { ascending: true })
      .limit(500),
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Logbook Entries' }]} />
      <main className="flex-1 overflow-hidden flex">
        <div className="w-full flex flex-col">
          <OpsTabStrip active="logbook" />
          <LogbookWorkflowBoard
            entries={(entriesRes.data ?? []) as any[]}
            workOrders={(workOrdersRes.data ?? []) as any[]}
            aircraft={(aircraftRes.data ?? []) as any[]}
            profile={profile as any}
          />
        </div>
      </main>
    </div>
  )
}
