import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { AircraftCompliancePanel } from '@/components/compliance/aircraft-compliance-panel'
import { createServerSupabase } from '@/lib/supabase/server'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Aircraft Compliance' }

/**
 * Per-aircraft compliance page (Spec 1.2).
 *
 * Mounts AircraftCompliancePanel — Due / All tabs, create-form,
 * inline mark-complete / defer / undefer / delete.
 *
 * Spec calls for embedding inside legacy AircraftDetail.tsx (3,626 lines);
 * we host the panel at this dedicated sub-route to keep diffs tight,
 * mirroring Sprint 1.1's /aircraft/[id]/meters pattern. Tab-embed is a
 * logged follow-up.
 */
export default async function AircraftCompliancePage({
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
          { label: 'Compliance' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        <div className="mb-4">
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Compliance — {tail}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Inspections, ADs, life-limited parts. Whichever-comes-first intervals
            recompute on every meter reading.
          </p>
        </div>
        <AircraftCompliancePanel
          aircraftId={params.id}
          userRole={membership.role as OrgRole}
        />
      </main>
    </div>
  )
}
