// OWNER: Dashboard showing all-aircraft economics summary.
// Revenue vs cost per aircraft, maintenance spend, operating cost trends.
//
// Wired 2026-05-15: mounts ProfitabilityCard (components/economics) per
// aircraft over computeTrueOperatingCost (lib/costs/calculator, 90-day
// window). Each card links to the full per-aircraft economics view at
// /aircraft/[id]/economics.
import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { requirePersona } from '@/lib/persona/route-guard'
import { Topbar } from '@/components/shared/topbar'
import { computeTrueOperatingCost } from '@/lib/costs/calculator'
import { EconomicsDashboard } from './economics-dashboard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Economics' }

export default async function EconomicsDashboardPage() {
  // Economics is an owner-finance surface (matches /aircraft/[id]/economics).
  const guard = await requirePersona(['owner', 'admin'])
  if (!guard.allowed) redirect(guard.redirectTo!)

  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const { data: aircraftRows } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, total_time_hours')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number', { ascending: true })

  const aircraft = (aircraftRows ?? []) as Array<{
    id: string
    tail_number: string
    make: string | null
    model: string | null
    total_time_hours: number | null
  }>

  // One 90-day operating-cost breakdown per aircraft, computed server-side.
  const economics = await Promise.all(
    aircraft.map(async (ac) => {
      const breakdown = await computeTrueOperatingCost({
        supabase,
        organizationId: orgId,
        aircraftId: ac.id,
        period: '90d',
      })
      return {
        id: ac.id,
        tailNumber: ac.tail_number,
        make: ac.make,
        model: ac.model,
        costTotal: breakdown.breakdown.totalSpend,
        flightHours: breakdown.breakdown.flightHours,
        wetCostPerHour: breakdown.wetCostPerHour,
        confidence: breakdown.confidence,
      }
    }),
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Economics' }]} />
      <main className="flex-1 overflow-y-auto">
        <EconomicsDashboard aircraft={economics} />
      </main>
    </div>
  )
}
