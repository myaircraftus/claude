// OWNER PERMISSIONS: Read-only. AI-generated maintenance-health report
// for the selected aircraft. Cannot create or edit underlying records.
//
// Server shell — resolves the org's aircraft + selected aircraft, checks
// whether it has any logbook history, then renders the client report view.
import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { requirePersona } from '@/lib/persona/route-guard'
import { Topbar } from '@/components/shared/topbar'
import { IntelligenceClient } from './intelligence-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Aircraft Intelligence' }

export default async function AircraftIntelligencePage({
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
    .select('id, tail_number, make, model')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number', { ascending: true })

  const aircraft = (aircraftRows ?? []) as Array<{
    id: string
    tail_number: string
    make: string | null
    model: string | null
  }>

  const selected =
    aircraft.find((ac) => ac.id === searchParams?.aircraft) ?? aircraft[0] ?? null

  // Does the selected aircraft have any logbook history? (drives the empty state)
  let hasHistory = false
  if (selected) {
    const { count } = await supabase
      .from('logbook_entries')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('aircraft_id', selected.id)
    hasHistory = (count ?? 0) > 0
  }

  const options = aircraft.map((a) => ({
    id: a.id,
    label: [a.tail_number, [a.make, a.model].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(' · '),
    tail: a.tail_number,
  }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Aircraft', href: '/aircraft' }, { label: 'Intelligence' }]}
      />
      <main className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-sm font-medium text-foreground">No aircraft yet</p>
            <p className="text-xs text-muted-foreground">
              Add an aircraft to generate an intelligence report.
            </p>
          </div>
        ) : (
          <IntelligenceClient
            key={selected.id}
            aircraft={options}
            selectedId={selected.id}
            hasHistory={hasHistory}
          />
        )}
      </main>
    </div>
  )
}
