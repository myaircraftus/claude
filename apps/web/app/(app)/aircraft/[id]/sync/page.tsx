import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase } from '@/lib/supabase/server'
import { AircraftSyncView } from '@/components/telemetry/aircraft-sync-view'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Aircraft Sync' }

/**
 * /(app)/aircraft/[id]/sync — Telemetry sync tab (Spec 4.3).
 *
 * Owner-facing surface for the ADSB-detected flight queue. Mechanics and
 * admins also see it (they confirm flights when fixing missed manual
 * Hobbs entries). Reuses the same sub-route pattern as /compliance,
 * /meters, /continued, /documents.
 */
export default async function AircraftSyncPage({ params }: { params: { id: string } }) {
  const { profile, membership } = await requireAppServerSession()

  const supabase = createServerSupabase()
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
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
          { label: 'Sync' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        <div className="mb-4">
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Telemetry — {tail}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Detected flights from public ADS-B data, with estimated Hobbs/Tach.
            Confirm or override before they roll into your meter history.
          </p>
        </div>
        <AircraftSyncView
          aircraftId={params.id}
          tailNumber={tail}
          userRole={membership.role as OrgRole}
        />
      </main>
    </div>
  )
}
