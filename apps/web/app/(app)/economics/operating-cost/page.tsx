// OWNER: AI-generated operating cost per aircraft.
//
// Wired 2026-05-15: mounts the existing EconomicsView (components/economics)
// for the selected aircraft. EconomicsView is the operating-cost UI — it
// renders the full per-hour breakdown (fuel, oil, engine/prop reserve,
// insurance, hangar, loan, depreciation), profitability, reserve status,
// and a cost-breakdown chart, all from computeTrueOperatingCost.
//
// NOTE: the brief asked for an editable form (fuel gal/hr, insurance $/mo,
// …) with a PUT save. The operating-cost data model is a *computed,
// read-only* breakdown derived from cost_entries + flight_events — there is
// no table/columns storing manual operating-cost inputs and no PUT route
// (/api/aircraft/[id]/operating-cost is GET-only). An editable form would
// need a new DB table, which is out of scope (no migrations this sprint).
// Mounted the existing read-only EconomicsView instead.
import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { requirePersona } from '@/lib/persona/route-guard'
import { Topbar } from '@/components/shared/topbar'
import { computeTrueOperatingCost } from '@/lib/costs/calculator'
import { EconomicsView } from '@/components/economics/EconomicsView'
import { OperatingCostPicker } from './operating-cost-picker'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Operating Cost' }

export default async function OperatingCostPage({
  searchParams,
}: {
  searchParams: { aircraft?: string }
}) {
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

  const selected =
    aircraft.find((ac) => ac.id === searchParams?.aircraft) ?? aircraft[0] ?? null

  const initial = selected
    ? await computeTrueOperatingCost({
        supabase,
        organizationId: orgId,
        aircraftId: selected.id,
        period: '90d',
      })
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Economics', href: '/economics' }, { label: 'Operating Cost' }]}
      />
      <main className="flex-1 overflow-y-auto">
        {!selected || !initial ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-sm font-medium text-foreground">No aircraft yet</p>
            <p className="text-xs text-muted-foreground">
              Operating cost appears here once an aircraft is added.
            </p>
          </div>
        ) : (
          <>
            <div className="max-w-7xl mx-auto px-6 pt-6">
              <OperatingCostPicker
                aircraft={aircraft.map((a) => ({
                  id: a.id,
                  label: [a.tail_number, [a.make, a.model].filter(Boolean).join(' ')]
                    .filter(Boolean)
                    .join(' · '),
                }))}
                selectedId={selected.id}
              />
            </div>
            <EconomicsView
              aircraftId={selected.id}
              tailNumber={selected.tail_number}
              make={selected.make}
              model={selected.model}
              totalTimeHours={selected.total_time_hours}
              initial={initial}
            />
          </>
        )}
      </main>
    </div>
  )
}
