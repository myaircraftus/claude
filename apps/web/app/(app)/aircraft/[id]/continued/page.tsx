import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { AircraftContinuedItemsPanel } from '@/components/continued/aircraft-continued-panel'
import { createServerSupabase } from '@/lib/supabase/server'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Aircraft Continued Items' }

/**
 * Per-aircraft continued items page (Spec 1.4).
 *
 * Mounts AircraftContinuedItemsPanel — Active / Resolved tabs, inline
 * create + resolve flow. Spec asks for a tab inside legacy AircraftDetail.tsx
 * (3,626 lines); we host the panel at this dedicated sub-route mirroring
 * Sprints 1.1 / 1.2 / 1.3. Tab-embed is a logged follow-up.
 */
export default async function AircraftContinuedItemsPage({
  params,
}: {
  params: { id: string }
}) {
  const { profile, membership } = await requireAppServerSession()
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
          { label: 'Continued' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        <div className="mb-4">
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Continued Items — {tail}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Found-but-deferred maintenance for this aircraft. Items follow the
            tail across work orders.
          </p>
        </div>
        <AircraftContinuedItemsPanel
          aircraftId={params.id}
          userRole={membership.role as OrgRole}
        />
      </main>
    </div>
  )
}
