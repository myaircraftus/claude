import { NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export type MarketplaceMemberRole = 'owner' | 'admin' | 'mechanic' | 'pilot' | 'viewer' | 'auditor' | 'scanner'

export interface MarketplaceContext {
  supabase: ReturnType<typeof createServerSupabase>
  service: ReturnType<typeof createServiceSupabase>
  user: { id: string; email?: string | null }
  profile: {
    id: string
    email: string
    full_name?: string | null
    is_platform_admin?: boolean | null
  }
  membership: {
    organization_id: string
    role: MarketplaceMemberRole
  }
  organizationId: string
  role: MarketplaceMemberRole
  isAdmin: boolean
}

export type MarketplaceContextResult =
  | { ok: true; ctx: MarketplaceContext }
  | { ok: false; response: NextResponse }

export const ACTIVE_PART_STATUSES = ['available', 'pending'] as const

export function isMarketplaceSellerManager(role?: string | null) {
  return role === 'owner' || role === 'admin' || role === 'mechanic'
}

export function isMarketplaceSellerAdmin(role?: string | null) {
  return role === 'owner' || role === 'admin'
}

export function isActiveMarketplacePartStatus(status?: string | null) {
  return !!status && (ACTIVE_PART_STATUSES as readonly string[]).includes(status)
}

export async function requireMarketplaceContext(): Promise<MarketplaceContextResult> {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const [profileRes, membershipRes] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, email, full_name, is_platform_admin')
      .eq('id', user.id)
      .single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const profile = profileRes.data
  const membership = membershipRes.data
  if (!profile) {
    return { ok: false, response: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) }
  }
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: 'Organization membership required' }, { status: 403 }) }
  }

  return {
    ok: true,
    ctx: {
      supabase,
      service: createServiceSupabase(),
      user,
      profile,
      membership,
      organizationId: membership.organization_id,
      role: membership.role as MarketplaceMemberRole,
      isAdmin: profile.is_platform_admin === true,
    },
  }
}

export async function ensureMarketplaceSellerAccount(service: ReturnType<typeof createServiceSupabase>, organizationId: string) {
  const { data: existing, error: selectError } = await (service as any)
    .from('marketplace_seller_accounts')
    .select('organization_id, plan_slug, status, current_period_end, started_at, created_by, updated_at')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!selectError && existing) {
    return existing as {
      organization_id: string
      plan_slug: string
      status: string
      current_period_end: string | null
      started_at: string
      created_by: string | null
      updated_at: string
    }
  }

  const { data: inserted, error: insertError } = await (service as any)
    .from('marketplace_seller_accounts')
    .upsert(
      { organization_id: organizationId, plan_slug: 'starter', status: 'active' },
      { onConflict: 'organization_id' }
    )
    .select('organization_id, plan_slug, status, current_period_end, started_at, created_by, updated_at')
    .single()

  if (insertError || !inserted) {
    throw new Error(insertError?.message || 'Failed to initialize seller account')
  }

  return inserted as {
    organization_id: string
    plan_slug: string
    status: string
    current_period_end: string | null
    started_at: string
    created_by: string | null
    updated_at: string
  }
}

export async function loadMarketplaceSellerPlan(service: ReturnType<typeof createServiceSupabase>, planSlug: string) {
  const { data, error } = await (service as any)
    .from('marketplace_seller_plans')
    .select(
      'slug, name, monthly_price_cents, annual_price_cents, active_listing_limit, supports_ai_listing_creation, supports_photo_upload, supports_video_upload, supports_priority_ranking, supports_advanced_analytics, supports_direct_contact, description'
    )
    .eq('slug', planSlug)
    .single()

  if (error || !data) {
    throw new Error(error?.message || `Unknown seller plan: ${planSlug}`)
  }

  return data as {
    slug: string
    name: string
    monthly_price_cents: number
    annual_price_cents: number | null
    active_listing_limit: number | null
    supports_ai_listing_creation: boolean
    supports_photo_upload: boolean
    supports_video_upload: boolean
    supports_priority_ranking: boolean
    supports_advanced_analytics: boolean
    supports_direct_contact: boolean
    description: string | null
  }
}

export async function countMarketplacePartListings(
  service: ReturnType<typeof createServiceSupabase>,
  organizationId: string,
  statuses: string[] = [...ACTIVE_PART_STATUSES]
) {
  const { count, error } = await (service as any)
    .from('marketplace_part_listings')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .in('status', statuses)

  if (error) {
    throw new Error(error.message)
  }

  return count ?? 0
}

