import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import IntegrationsClient from './integrations-client'

export const metadata = { title: 'Integrations' }

export default async function IntegrationsPage() {
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

  if (!membershipRes.data) redirect('/onboarding')

  const membership = membershipRes.data as any
  const canManage = ['owner', 'admin'].includes(membership.role)

  let integrations: any[] = []
  try {
    const { data } = await supabase
      .from('integrations')
      .select('*')
      .eq('organization_id', membership.organization_id)
    integrations = data ?? []
  } catch {}

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profileRes.data as any}
        breadcrumbs={[{ label: 'Integrations' }]}
      />
      <IntegrationsClient
        integrations={integrations}
        orgId={membership.organization_id}
        canManage={canManage}
        userRole={membership.role}
      />
    </div>
  )
}
