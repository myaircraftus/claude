import { NextRequest, NextResponse } from 'next/server'
import {
  countMarketplacePartListings,
  ensureMarketplaceSellerAccount,
  isMarketplaceSellerAdmin,
  requireMarketplaceContext,
  loadMarketplaceSellerPlan,
} from '../_shared'

// GET /api/marketplace/seller-plan
// PATCH /api/marketplace/seller-plan

export async function GET() {
  const ctxRes = await requireMarketplaceContext()
  if (!ctxRes.ok) return ctxRes.response

  const { service, organizationId } = ctxRes.ctx
  const account = await ensureMarketplaceSellerAccount(service, organizationId)

  const [currentPlan, plans, activeListingCount] = await Promise.all([
    loadMarketplaceSellerPlan(service, account.plan_slug),
    (async () => {
      const { data } = await (service as any)
        .from('marketplace_seller_plans')
        .select(
          'slug, name, monthly_price_cents, annual_price_cents, active_listing_limit, supports_ai_listing_creation, supports_photo_upload, supports_video_upload, supports_priority_ranking, supports_advanced_analytics, supports_direct_contact, description'
        )
        .order('monthly_price_cents', { ascending: true })
      return (data ?? []) as Awaited<ReturnType<typeof loadMarketplaceSellerPlan>>[]
    })(),
    countMarketplacePartListings(service, organizationId),
  ])

  return NextResponse.json({
    account,
    current_plan: currentPlan,
    plans,
    usage: {
      active_listings: activeListingCount,
      remaining_active_listings:
        currentPlan.active_listing_limit == null
          ? null
          : Math.max(0, currentPlan.active_listing_limit - activeListingCount),
    },
  })
}

export async function PATCH(req: NextRequest) {
  const ctxRes = await requireMarketplaceContext()
  if (!ctxRes.ok) return ctxRes.response

  const { service, organizationId, role, user } = ctxRes.ctx
  if (!isMarketplaceSellerAdmin(role)) {
    return NextResponse.json({ error: 'Owner or admin required' }, { status: 403 })
  }

  let body: { planSlug?: string; status?: string; currentPeriodEnd?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const planSlug = body.planSlug?.trim()
  if (!planSlug) {
    return NextResponse.json({ error: 'planSlug required' }, { status: 400 })
  }

  const [currentPlan, activeListingCount] = await Promise.all([
    loadMarketplaceSellerPlan(service, planSlug),
    countMarketplacePartListings(service, organizationId),
  ])

  if (
    currentPlan.active_listing_limit != null &&
    activeListingCount > currentPlan.active_listing_limit
  ) {
    return NextResponse.json(
      {
        error: `Plan limit exceeded. You have ${activeListingCount} active listings and ${currentPlan.name} allows ${currentPlan.active_listing_limit}.`,
      },
      { status: 409 }
    )
  }

  const { data, error } = await (service as any)
    .from('marketplace_seller_accounts')
    .upsert(
      {
        organization_id: organizationId,
        plan_slug: currentPlan.slug,
        status: body.status ?? 'active',
        current_period_end: body.currentPeriodEnd ?? null,
        created_by: user.id,
      },
      { onConflict: 'organization_id' }
    )
    .select('organization_id, plan_slug, status, current_period_end, started_at, created_by, updated_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to update seller plan' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    account: data,
    current_plan: currentPlan,
    usage: {
      active_listings: activeListingCount,
      remaining_active_listings:
        currentPlan.active_listing_limit == null
          ? null
          : Math.max(0, currentPlan.active_listing_limit - activeListingCount),
    },
  })
}

