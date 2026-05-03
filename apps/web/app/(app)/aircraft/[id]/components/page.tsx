import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase } from '@/lib/supabase/server'
import { SerialComponentsList } from '@/components/aircraft/SerialComponentsList'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Engines & Props' }

/**
 * /(app)/aircraft/[id]/components — Spec 3.2 sub-page wrapping the
 * SerialComponentsList. Same Path-B sub-route pattern as
 * /aircraft/[id]/{compliance,economics,pricing}.
 */
export default async function AircraftComponentsPage({
  params,
}: {
  params: { id: string }
}) {
  const { profile, membership } = await requireAppServerSession()
  const supabase = createServerSupabase()
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
    .maybeSingle()
  if (!aircraft) redirect('/aircraft')

  const tail = (aircraft as { tail_number: string }).tail_number
  const canWrite = ['owner', 'admin', 'mechanic'].includes(membership.role)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: tail, href: `/aircraft/${params.id}` },
          { label: 'Engines & Props' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        <SerialComponentsList aircraftId={params.id} tailNumber={tail} canWrite={canWrite} />
      </main>
    </div>
  )
}
