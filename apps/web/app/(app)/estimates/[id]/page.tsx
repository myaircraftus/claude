import { redirect, notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { EstimateDetail } from './estimate-detail'
import type { UserProfile } from '@/types'

export default async function EstimateDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  if (!profileRes.data || !membershipRes.data) redirect('/login')

  const profile = profileRes.data as UserProfile
  const orgId = membershipRes.data.organization_id

  const { data: estimate } = await supabase
    .from('estimates')
    .select(`
      *,
      aircraft:aircraft_id (id, tail_number, make, model, year),
      customer:customer_id (id, name, email, company),
      line_items:estimate_line_items (*)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!estimate) notFound()

  // Sort line items
  if (estimate.line_items) {
    (estimate.line_items as any[]).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }

  // Fetch linked squawks
  const squawkIds: string[] = Array.isArray((estimate as any).linked_squawk_ids)
    ? (estimate as any).linked_squawk_ids
    : []
  let linkedSquawks: any[] = []
  if (squawkIds.length > 0) {
    const { data } = await supabase
      .from('squawks')
      .select('id, title, description, severity')
      .in('id', squawkIds)
    linkedSquawks = data ?? []
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Estimates', href: '/estimates' },
          { label: (estimate as any).estimate_number ?? 'Estimate' },
        ]}
      />
      <EstimateDetail initialEstimate={estimate as any} initialSquawks={linkedSquawks} />
    </div>
  )
}
