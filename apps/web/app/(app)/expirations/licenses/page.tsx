// Expirations — Mechanic Licenses & Certificates. Backed by the
// mechanic_certificates table; status derived from expiration_date.
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { LicensesExpirationClient } from './licenses-expiration-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mechanic Licenses & Certificates' }

export default async function LicensesExpirationPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const { data: certificates } = await supabase
    .from('mechanic_certificates')
    .select('*')
    .eq('organization_id', orgId)
    .order('expiration_date', { ascending: true, nullsFirst: false })
    .limit(500)

  // Mechanic roster — for the Add modal dropdown + name resolution.
  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('user_id, role, persona')
    .eq('organization_id', orgId)
    .not('accepted_at', 'is', null)

  const userIds = Array.from(
    new Set((memberships ?? []).map((m) => m.user_id).filter(Boolean)),
  )

  const { data: profiles } = userIds.length
    ? await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('id', userIds)
    : { data: [] }

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  const roster = userIds.map((id) => {
    const p = profileById.get(id)
    return {
      user_id: id,
      name: p?.full_name ?? p?.email ?? 'Unknown',
      email: p?.email ?? null,
    }
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Expirations' }, { label: 'Licenses' }]} />
      <main className="flex-1 overflow-hidden">
        <LicensesExpirationClient
          certificates={(certificates ?? []) as any[]}
          roster={roster as any[]}
        />
      </main>
    </div>
  )
}
