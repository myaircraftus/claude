import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase } from '@/lib/supabase/server'
import { ExpiringDocsView } from '@/app/(app)/documents/expiring/expiring-view'

export const metadata = { title: 'Aircraft Documents' }

/**
 * Per-aircraft expiring-documents sub-route (Spec 2.6.2 acceptance clause 3).
 *
 * Reuses ExpiringDocsView with aircraftId so the form preselects the aircraft
 * on insert and the GET filter scopes to that aircraft.
 */
export default async function AircraftDocumentsPage({
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
          { label: 'Documents' },
        ]}
      />
      <main className="flex-1 overflow-hidden">
        <ExpiringDocsView aircraftId={params.id} />
      </main>
    </div>
  )
}
