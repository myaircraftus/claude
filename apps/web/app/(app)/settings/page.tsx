import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { SettingsClient } from './settings-client'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Settings' }

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string; upgraded?: string }
}) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role, organizations(*)')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile
  if (!membershipRes.data) redirect('/onboarding')

  const org = (membershipRes.data as any).organizations
  const role = membershipRes.data.role
  const orgId = membershipRes.data.organization_id

  // Fetch members
  const { data: members } = await supabase
    .from('organization_memberships')
    .select('id, role, invited_at, accepted_at, user_profiles(id, email, full_name, avatar_url)')
    .eq('organization_id', orgId)
    .order('invited_at')

  // Check Drive connection
  const { data: driveConnection } = await supabase
    .from('gdrive_connections')
    .select('id, google_email, is_active, created_at')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  // Fetch documents uploaded by this user
  let uploadedDocs: any[] = []
  try {
    const { data } = await supabase
      .from('documents')
      .select('id, title, doc_type, uploaded_at, manual_access, allow_download, community_listing, price, uploader_role, aircraft:aircraft_id(id, tail_number)')
      .eq('uploaded_by', user.id)
      .order('uploaded_at', { ascending: false })
      .limit(200)
    uploadedDocs = data ?? []
  } catch {}

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Settings' }]}
      />
      <SettingsClient
        profile={profile}
        organization={org}
        role={role}
        members={(members ?? []) as any}
        driveConnection={driveConnection}
        defaultTab={searchParams.tab ?? 'organization'}
        showUpgradeSuccess={searchParams.upgraded === 'true'}
        uploadedDocs={uploadedDocs}
      />
    </div>
  )
}
