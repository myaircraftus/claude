import { redirect, notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import type { UserProfile, Aircraft } from '@/types'
import { SquawksView } from './squawks-view'

export const metadata = { title: 'Squawks' }

export default async function SquawksPage({ params }: { params: { id: string } }) {
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

  const profile = profileRes.data as UserProfile
  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id

  // Fetch aircraft
  const { data: aircraft, error: acError } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (acError || !aircraft) notFound()

  // Fetch squawks for this aircraft
  const { data: squawks } = await supabase
    .from('squawks')
    .select(`
      id, aircraft_id, title, description, severity, status, source,
      source_metadata, assigned_work_order_id, reported_at, resolved_at,
      created_at, updated_at,
      reporter:reported_by (id, full_name, email, avatar_url)
    `)
    .eq('aircraft_id', params.id)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100)

  // Fetch org mechanics for maintenance request dialog
  const { data: mechanics } = await supabase
    .from('organization_memberships')
    .select('user_id, role, user:user_id (id, full_name, email)')
    .eq('organization_id', orgId)
    .eq('role', 'mechanic')
    .not('accepted_at', 'is', null)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: aircraft.tail_number, href: `/aircraft/${params.id}` },
          { label: 'Squawks' },
        ]}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <SquawksView
            aircraftId={params.id}
            aircraftTail={aircraft.tail_number}
            initialSquawks={(squawks ?? []).map((s: any) => ({
              ...s,
              reporter: Array.isArray(s.reporter) ? s.reporter[0] ?? null : s.reporter ?? null,
            }))}
            mechanics={(mechanics ?? []).map((m: any) => ({
              id: m.user_id,
              full_name: m.user?.full_name ?? m.user?.email ?? 'Unknown',
              email: m.user?.email ?? '',
            }))}
          />
        </div>
      </main>
    </div>
  )
}
