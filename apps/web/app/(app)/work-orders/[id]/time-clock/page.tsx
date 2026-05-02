import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { TimeClockPanel } from '@/components/timeclock/time-clock-panel'
import { createServerSupabase } from '@/lib/supabase/server'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Time clock' }

/**
 * Per-WO time clock page (Spec 2.3). Mounts TimeClockPanel — the spec
 * calls for embedding this in the legacy WorkOrderPanel; we host it at
 * a dedicated sub-route mirroring 1.1 / 1.2 / 1.3 / 1.4 / 1.5. Tab-embed
 * is a logged follow-up.
 *
 * Pulls the WO's labor rate from the first labor line if present (so
 * clock-ins default to a sensible rate); operator can override in the
 * clock-in form.
 */
export default async function WorkOrderTimeClockPage({
  params,
}: {
  params: { id: string }
}) {
  const { profile, membership } = await requireAppServerSession()
  const supabase = createServerSupabase()
  const { data: wo } = await supabase
    .from('work_orders')
    .select('id, work_order_number, aircraft_id')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!wo) redirect('/work-orders')

  // Look up first labor line's rate as default
  const { data: laborLine } = await supabase
    .from('work_order_lines')
    .select('rate')
    .eq('organization_id', membership.organization_id)
    .eq('work_order_id', params.id)
    .eq('line_type', 'labor')
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()
  const defaultRate = Number(laborLine?.rate) || 0

  // Aircraft tail for breadcrumb
  let tail: string | null = null
  if (wo.aircraft_id) {
    const { data: ac } = await supabase
      .from('aircraft')
      .select('tail_number')
      .eq('id', wo.aircraft_id)
      .maybeSingle()
    tail = ac?.tail_number ?? null
  }

  const woLabel = (wo as { work_order_number: string | null }).work_order_number || 'WO'
  const breadcrumbs = [
    { label: 'Work orders', href: '/work-orders' },
    { label: tail ? `${woLabel} · ${tail}` : woLabel, href: `/work-orders/${params.id}` },
    { label: 'Time clock' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={breadcrumbs} />
      <main className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        <div className="mb-4">
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Time clock — {woLabel}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Clock in to start a live timer. Hours and labor cost roll into the
            work order's totals.
          </p>
        </div>
        <TimeClockPanel
          workOrderId={params.id}
          userRole={membership.role as OrgRole}
          defaultRate={defaultRate}
        />
      </main>
    </div>
  )
}
