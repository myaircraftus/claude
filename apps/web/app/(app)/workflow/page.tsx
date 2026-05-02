import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { WorkflowBoard } from './workflow-board'

export const metadata = { title: 'Workflow' }

/**
 * Workflow board — kanban view of every active work order in the org,
 * grouped by status. Each card shows the WO number, aircraft, mechanic
 * assignment, and progress. Clicking a card opens the work order detail
 * page directly (single source of truth).
 */
export default async function WorkflowPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  // Pull every non-archived WO + aircraft + mechanic lookup in parallel.
  // Note: actual DB column is `complaint` (not customer_complaint) — alias it
  // here so the WorkflowBoard's `customer_complaint` field stays populated.
  const [woRes, mechRes] = await Promise.all([
    supabase
      .from('work_orders')
      .select(`
        id,
        work_order_number,
        status,
        customer_complaint:complaint,
        discrepancy,
        labor_total,
        parts_total,
        outside_services_total,
        total_amount,
        opened_at,
        created_at,
        updated_at,
        assigned_mechanic_id,
        aircraft:aircraft_id (id, tail_number, make, model)
      `)
      .eq('organization_id', orgId)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })
      .limit(300),
    supabase
      .from('organization_memberships')
      .select(`
        user_id,
        role,
        user_profiles:user_id (id, full_name, email)
      `)
      .eq('organization_id', orgId)
      .not('accepted_at', 'is', null),
  ])

  const workOrders = (woRes.data ?? []) as any[]
  const mechanics = (mechRes.data ?? []) as any[]

  // Map mechanic id → name lookup so the cards show "Mike Davis" instead of UUIDs.
  const mechanicById = new Map<string, { name: string; role: string }>()
  for (const m of mechanics) {
    const profile = Array.isArray(m.user_profiles) ? m.user_profiles[0] : m.user_profiles
    if (!m.user_id || !profile) continue
    mechanicById.set(m.user_id, {
      name: profile.full_name || profile.email || 'Unknown',
      role: m.role || 'mechanic',
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Workflow' }]} />
      <main className="flex-1 overflow-hidden">
        <WorkflowBoard
          workOrders={workOrders}
          mechanicById={Object.fromEntries(mechanicById)}
        />
      </main>
    </div>
  )
}
