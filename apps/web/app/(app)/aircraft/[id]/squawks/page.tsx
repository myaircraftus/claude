import { redirect, notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import type { UserProfile } from '@/types'
import { SquawksWorkspace } from '@/components/squawks/squawks-workspace'

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
    .select('id, tail_number, make, model, owner_customer_id')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (acError || !aircraft) notFound()

  // Fetch squawks for this aircraft
  const { data: squawks } = await supabase
    .from('squawks')
    .select(`
      id, organization_id, aircraft_id, title, description, category, severity, status, source,
      source_metadata, owner_visible, owner_summary, current_route_type,
      assigned_work_order_id, linked_estimate_id, linked_task_id, linked_checklist_item_id,
      reported_at, resolved_at, verified_by_user_id, verified_at,
      closure_reason, closure_notes, duplicate_of_squawk_id,
      suggested_ata_code, suggested_jasc_code, confirmed_ata_code, confirmed_jasc_code,
      classification_source, classification_confidence, classification_status,
      created_at, updated_at,
      reporter:reported_by (id, full_name, email, avatar_url),
      aircraft:aircraft_id (id, tail_number, make, model),
      evidence:squawk_evidence (id, evidence_type, file_name, file_type, owner_visible, internal_only, created_at),
      ai_drafts:squawk_ai_drafts (id, status, confidence, suggested_title, suggested_severity, suggested_route, created_at),
      status_history:squawk_status_history (id, from_status, to_status, reason, notes, actor_id, created_at)
    `)
    .eq('aircraft_id', params.id)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100)

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
        <div className="-m-6">
          <SquawksWorkspace
            mode="aircraft"
            lockedAircraft={aircraft as any}
            aircraftOptions={[aircraft as any]}
            initialSquawks={(squawks ?? []).map((s: any) => ({
              ...s,
              reporter: Array.isArray(s.reporter) ? s.reporter[0] ?? null : s.reporter ?? null,
            }))}
          />
        </div>
      </main>
    </div>
  )
}
