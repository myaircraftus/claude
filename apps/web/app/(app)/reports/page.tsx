// Reports — persona-aware reporting surface. The server resolves the persona,
// fetches a generous (~13-month) window of org-scoped data, and hands plain
// arrays to <ReportsClient />, which computes report cards client-side.
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { Topbar } from '@/components/shared/topbar'
import { ReportsClient } from './reports-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Reports' }

export default async function ReportsPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id
  const { persona } = await getCurrentPersona()

  // ~13-month window for date-filterable rows.
  const windowStart = new Date()
  windowStart.setMonth(windowStart.getMonth() - 13)
  const sinceIso = windowStart.toISOString()

  // Defensive fetch helper — never let one bad query crash the page.
  const safe = async <T,>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
    try {
      const { data } = await p
      return (data ?? []) as T[]
    } catch {
      return []
    }
  }

  const [
    workOrders,
    aircraft,
    complianceItems,
    invoices,
    squawks,
    workOrderParts,
    workOrderLines,
    timeEntries,
    operatingCosts,
    logbookEntries,
    memberships,
  ] = await Promise.all([
    safe(
      supabase
        .from('work_orders')
        .select('*')
        .eq('organization_id', orgId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(2000),
    ),
    safe(supabase.from('aircraft').select('*').eq('organization_id', orgId).limit(1000)),
    safe(
      supabase
        .from('compliance_items')
        .select('*')
        .eq('organization_id', orgId)
        .limit(3000),
    ),
    safe(
      supabase
        .from('invoices')
        .select('*')
        .eq('organization_id', orgId)
        .gte('created_at', sinceIso)
        .limit(2000),
    ),
    safe(
      supabase
        .from('squawks')
        .select('*')
        .eq('organization_id', orgId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(2000),
    ),
    safe(supabase.from('work_order_parts').select('*').eq('organization_id', orgId).limit(5000)),
    safe(supabase.from('work_order_lines').select('*').eq('organization_id', orgId).limit(5000)),
    safe(
      supabase
        .from('time_entries')
        .select('*')
        .eq('organization_id', orgId)
        .gte('start_time', sinceIso)
        .limit(5000),
    ),
    safe(supabase.from('aircraft_operating_costs').select('*').eq('organization_id', orgId).limit(1000)),
    safe(
      supabase
        .from('logbook_entries')
        .select('*')
        .eq('organization_id', orgId)
        .gte('created_at', sinceIso)
        .limit(3000),
    ),
    safe(
      supabase
        .from('organization_memberships')
        .select('user_id')
        .eq('organization_id', orgId)
        .limit(500),
    ),
  ])

  // Resolve mechanic/technician names from user_profiles.
  const userIds = Array.from(
    new Set((memberships as { user_id: string }[]).map((m) => m?.user_id).filter(Boolean)),
  )
  const userProfiles =
    userIds.length > 0
      ? await safe(
          supabase.from('user_profiles').select('id, full_name, email').in('id', userIds),
        )
      : []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Reports' }]} />
      <main className="flex-1 overflow-hidden">
        <ReportsClient
          persona={persona}
          workOrders={workOrders as any[]}
          aircraft={aircraft as any[]}
          complianceItems={complianceItems as any[]}
          invoices={invoices as any[]}
          squawks={squawks as any[]}
          workOrderParts={workOrderParts as any[]}
          workOrderLines={workOrderLines as any[]}
          timeEntries={timeEntries as any[]}
          operatingCosts={operatingCosts as any[]}
          logbookEntries={logbookEntries as any[]}
          userProfiles={userProfiles as any[]}
        />
      </main>
    </div>
  )
}
