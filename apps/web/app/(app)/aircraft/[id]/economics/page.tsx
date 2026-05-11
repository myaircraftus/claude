import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { requirePersona } from '@/lib/persona/route-guard'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase } from '@/lib/supabase/server'
import { computeTrueOperatingCost } from '@/lib/costs/calculator'
import { EconomicsView } from '@/components/economics/EconomicsView'
import type { Aircraft } from '@/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Aircraft Economics' }

/**
 * /(app)/aircraft/[id]/economics  (Spec 7.5)
 *
 * Owner-facing P&L dashboard. Hydrates the initial 90-day breakdown
 * server-side so the page is useful on first paint; the client view
 * re-fetches when the period switcher changes.
 *
 * Revenue: aircraft.rental_rate column doesn't exist yet (logged 7.4
 * follow-up); for now we show $0 revenue + the "Set rental rate" hint
 * exactly as the sprint plan calls for.
 */
export default async function AircraftEconomicsPage({
  params,
}: {
  params: { id: string }
}) {
  // Phase 18 Sprint 18.4 — owner/admin-only route (closes Phase 15 F2)
  const guard = await requirePersona(['owner', 'admin'])
  if (!guard.allowed) redirect(guard.redirectTo!)

  const { profile, membership } = await requireAppServerSession()
  const supabase = createServerSupabase()

  const { data: aircraftRow } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, year, total_time_hours')
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
    .eq('is_archived', false)
    .maybeSingle()
  if (!aircraftRow) redirect('/aircraft')

  const aircraft = aircraftRow as Pick<Aircraft, 'id' | 'tail_number' | 'make' | 'model' | 'year' | 'total_time_hours'>

  // Initial breakdown — 90d default, hydrated server-side.
  const initial = await computeTrueOperatingCost({
    supabase,
    organizationId: membership.organization_id,
    aircraftId: params.id,
    period: '90d',
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: aircraft.tail_number, href: `/aircraft/${params.id}` },
          { label: 'Economics' },
        ]}
      />
      <main className="flex-1 overflow-y-auto">
        <EconomicsView
          aircraftId={params.id}
          tailNumber={aircraft.tail_number}
          make={aircraft.make ?? null}
          model={aircraft.model ?? null}
          totalTimeHours={aircraft.total_time_hours ?? null}
          initial={initial}
        />
      </main>
    </div>
  )
}
