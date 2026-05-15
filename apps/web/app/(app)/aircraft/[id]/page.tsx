import { redirect } from 'next/navigation'
import { AircraftWorkspaceDetail } from '@/components/aircraft/aircraft-workspace-detail'
import { createServerSupabase } from '@/lib/supabase/server'

export const metadata = { title: 'Aircraft Workspace' }

export default async function AircraftDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <AircraftWorkspaceDetail aircraftId={params.id} />
}
