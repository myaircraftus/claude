import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { WorkspaceClient } from './workspace-client'
import type { Aircraft } from '@/types'

export const metadata = {
  title: 'Workspace — myaircraft.us',
}

export default async function WorkspacePage() {
  const supabase = createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Membership & org
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, organizations(*)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id
  const organization = (membership as any).organizations

  // Aircraft list
  const { data: aircraftData } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, year, is_archived')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })

  const aircraft: Aircraft[] = (aircraftData ?? []) as Aircraft[]

  // Recent threads — gracefully handle if table doesn't exist yet
  let recentThreads: Array<{
    id: string
    title: string
    aircraft_id: string | null
    is_pinned: boolean
    created_at: string
    updated_at: string
  }> = []

  try {
    const { data: threadsData } = await supabase
      .from('chat_threads')
      .select('id, title, aircraft_id, is_pinned, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(50)

    recentThreads = threadsData ?? []
  } catch {
    // Table may not exist yet — start fresh
  }

  return (
    <WorkspaceClient
      organizationId={orgId}
      userId={user.id}
      aircraft={aircraft}
      initialThreads={recentThreads}
    />
  )
}
