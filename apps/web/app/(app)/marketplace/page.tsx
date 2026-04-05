import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { MarketplaceClient } from './marketplace-client'
import type { UserProfile, Document } from '@/types'

export const metadata = { title: 'Marketplace' }

interface MarketplaceListing extends Document {
  aircraft: { id: string; tail_number: string; make: string; model: string } | null
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
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
  if (!profile) redirect('/login')
  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id as string
  const role = membership.role as string
  const isAdmin = profile.is_platform_admin === true

  // ── Browse: all published community listings across orgs ────────────────
  const { data: browseRows } = await (supabase as any)
    .from('documents')
    .select(`*, aircraft:aircraft_id (id, tail_number, make, model)`)
    .eq('community_listing', true)
    .eq('listing_status', 'published')
    .order('download_count', { ascending: false })
    .limit(50)

  // ── Seller: org's own community listings (any status) ───────────────────
  const { data: sellerRows } = await (supabase as any)
    .from('documents')
    .select(`*, aircraft:aircraft_id (id, tail_number, make, model)`)
    .eq('organization_id', orgId)
    .eq('community_listing', true)
    .order('uploaded_at', { ascending: false })

  // ── Moderation queue (platform admins only) ─────────────────────────────
  let moderationRows: MarketplaceListing[] = []
  if (isAdmin) {
    const { data } = await (supabase as any)
      .from('documents')
      .select(`*, aircraft:aircraft_id (id, tail_number, make, model)`)
      .eq('community_listing', true)
      .eq('listing_status', 'pending_review')
      .order('uploaded_at', { ascending: false })
    moderationRows = (data ?? []) as MarketplaceListing[]
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Marketplace' }]} />
      <MarketplaceClient
        browseListings={(browseRows ?? []) as MarketplaceListing[]}
        sellerListings={(sellerRows ?? []) as MarketplaceListing[]}
        moderationListings={moderationRows}
        currentUserId={user.id}
        currentUserName={profile.full_name || profile.email}
        isAdmin={isAdmin}
        role={role}
        defaultTab={searchParams.tab ?? 'browse'}
      />
    </div>
  )
}
