import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { AircraftMeterPanel } from '@/components/meters/aircraft-meter-panel'
import { createServerSupabase } from '@/lib/supabase/server'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Aircraft Times' }

/**
 * Per-aircraft meter page (Spec 1.1).
 *
 * Mounts the AircraftMeterPanel — current meter values + log-a-reading +
 * history. Spec calls for an "Aircraft Times" tab inside the legacy
 * AircraftDetail.tsx (3,626 lines); we host the panel at this dedicated
 * sub-route to keep the diff tight, and link to it from the aircraft
 * page header. Embedding into AircraftDetail is logged as a follow-up
 * in context.md §8.
 */
export default async function AircraftMetersPage({
  params,
}: {
  params: { id: string }
}) {
  const { profile, membership } = await requireAppServerSession()

  // Quick existence check + breadcrumb context — RLS still enforces.
  const supabase = createServerSupabase()
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!aircraft) redirect('/aircraft')

  const tail = (aircraft as { tail_number: string }).tail_number

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: tail, href: `/aircraft/${params.id}` },
          { label: 'Times' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        <div className="mb-4">
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Aircraft Times — {tail}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Current meter values, recent readings, and the log-a-reading form.
            Driven by the meter profile assigned to this aircraft.
          </p>
        </div>
        <AircraftMeterPanel
          aircraftId={params.id}
          userRole={membership.role as OrgRole}
        />
      </main>
    </div>
  )
}
