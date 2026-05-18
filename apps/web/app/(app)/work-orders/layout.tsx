import { requireAppServerSession } from '@/lib/auth/server-app'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { requirePersona } from '@/lib/persona/route-guard'
import { getCurrentPersona } from '@/lib/persona/server'
import { Topbar } from '@/components/shared/topbar'
import { WorkOrdersShell, type WorkOrderListItem, type ShellAircraft } from './work-orders-shell'

// Server-side pagination: 25 work orders/page via ?page=. The list
// previously loaded up to 300 rows for the org on every render.
const PAGE_SIZE = 25

/**
 * Layout for both /work-orders (no selection) and /work-orders/[id]
 * (selected). The list of WOs is fetched once here and the right
 * panel is rendered as `children` — so navigating between WOs
 * doesn't refetch the list and doesn't reset scroll.
 */
export default async function WorkOrdersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Owners view work orders read-only (PART 3A); shop/admin get full
  // access. Owner was added to the allowlist so the guard no longer
  // redirects them — the read-only UI gating happens via `isOwner` below.
  const guard = await requirePersona(['owner', 'shop', 'admin'])
  if (!guard.allowed) redirect(guard.redirectTo!)

  const { supabase, profile, membership } = await requireAppServerSession()
  const { persona } = await getCurrentPersona()
  const isOwner = persona === 'owner'
  const orgId = membership.organization_id

  // Next.js does not pass `searchParams` to layouts, so read ?page= from the
  // raw query string the middleware forwards via the x-request-search header.
  const rawSearch = headers().get('x-request-search') ?? ''
  const pageParam = new URLSearchParams(rawSearch).get('page')
  const page = Math.max(1, parseInt(pageParam ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  const [woRes, acRes] = await Promise.all([
    supabase
      .from('work_orders')
      .select(`
        id,
        work_order_number,
        status,
        complaint,
        total_amount,
        opened_at,
        created_at,
        updated_at,
        aircraft_id,
        aircraft:aircraft_id (id, tail_number, make, model)
      `, { count: 'exact' })
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
    supabase
      .from('aircraft')
      .select('id, tail_number')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .order('tail_number'),
  ])

  const totalPages = Math.max(1, Math.ceil((woRes.count ?? 0) / PAGE_SIZE))
  const workOrdersRaw = (woRes.data ?? []) as any[]
  const workOrders: WorkOrderListItem[] = workOrdersRaw.map((wo) => ({
    id: wo.id,
    work_order_number: wo.work_order_number,
    status: wo.status,
    customer_complaint: wo.complaint ?? null,
    total_amount: typeof wo.total_amount === 'number' ? wo.total_amount : Number(wo.total_amount ?? 0),
    opened_at: wo.opened_at,
    created_at: wo.created_at,
    updated_at: wo.updated_at,
    aircraft_id: wo.aircraft_id,
    aircraft: Array.isArray(wo.aircraft) ? wo.aircraft[0] : wo.aircraft,
  }))
  const aircraft = (acRes.data ?? []) as ShellAircraft[]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Work Orders' }]} />
      <main className="flex-1 overflow-hidden">
        <WorkOrdersShell
          workOrders={workOrders}
          aircraft={aircraft}
          isOwner={isOwner}
          page={page}
          totalPages={totalPages}
        >
          {children}
        </WorkOrdersShell>
      </main>
    </div>
  )
}
