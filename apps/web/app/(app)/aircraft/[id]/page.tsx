import { redirect } from 'next/navigation'
import { AircraftWorkspaceDetail } from '@/components/aircraft/aircraft-workspace-detail'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUUID } from '@/lib/utils'

export const metadata = { title: 'Aircraft Workspace' }

export default async function AircraftDetailPage({
  params,
}: {
  params: { id: string }
}) {
  // Guard the dynamic [id] segment — a non-UUID (e.g. /aircraft/dashboard)
  // must never reach a Supabase `.eq('id', …)` query, which would error.
  if (!params.id || !isUUID(params.id)) redirect('/aircraft')

  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <AircraftWorkspaceDetail aircraftId={params.id} />
}
