import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { ScannerApp } from '@/components/scanner/ScannerApp'

export const metadata = { title: 'Scanner — MyAircraft' }

export default async function ScannerPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/scanner/login')

  const [membershipRes, aircraftRes] = await Promise.all([
    supabase
      .from('organization_memberships')
      .select('organization_id, role, organizations(name)')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model, year'),
  ])

  if (!membershipRes.data) redirect('/scanner/login')

  const membership = membershipRes.data as any
  const orgId = membership.organization_id
  const orgName = membership.organizations?.name ?? ''

  // Filter aircraft to this org
  const { data: orgAircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, year')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  return (
    <ScannerApp
      aircraft={orgAircraft ?? []}
      organizationId={orgId}
      organizationName={orgName}
      userRole={membership.role}
      userId={user.id}
    />
  )
}
