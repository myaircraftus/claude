// Aircraft Operating Cost — owner-editable cost profile.
//
// Server shell: resolves the org's aircraft + the selected aircraft from
// ?aircraft=, then renders the editable OperatingCostForm. The form loads
// the saved profile (or an AI suggestion) from
// /api/aircraft/[id]/operating-cost/profile and saves back with PUT.
import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { requirePersona } from '@/lib/persona/route-guard'
import { Topbar } from '@/components/shared/topbar'
import { OperatingCostForm } from './operating-cost-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Aircraft Operating Cost' }

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

  const options = aircraft.map((a) => ({
    id: a.id,
    label: [a.tail_number, [a.make, a.model].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(' · '),
  }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Economics', href: '/economics' }, { label: 'Operating Cost' }]}
      />
      <main className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-sm font-medium text-foreground">No aircraft yet</p>
            <p className="text-xs text-muted-foreground">
              Add an aircraft first, then set its operating cost here.
            </p>
          </div>
        ) : (
          // key=selected.id remounts the form with a fresh fetch per aircraft.
          <OperatingCostForm key={selected.id} aircraft={options} selectedId={selected.id} />
        )}
      </main>
    </div>
  )
}
