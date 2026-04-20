import { NextRequest, NextResponse } from 'next/server'
import {
  countMarketplacePartListings,
  ensureMarketplaceSellerAccount,
  isActiveMarketplacePartStatus,
  isMarketplaceSellerManager,
  requireMarketplaceContext,
} from '../../../../_shared'

type ListingStatus = 'draft' | 'available' | 'pending' | 'sold' | 'archived'

function parseStatus(raw: unknown): ListingStatus | null {
  const value = String(raw)
  return ['draft', 'available', 'pending', 'sold', 'archived'].includes(value) ? (value as ListingStatus) : null
}

async function loadListing(service: any, id: string) {
  const { data, error } = await service
    .from('marketplace_part_listings')
    .select('id, organization_id, status, published_at, archived_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Record<string, unknown> | null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctxRes = await requireMarketplaceContext()
  if (!ctxRes.ok) return ctxRes.response

  const { service, organizationId, role, user } = ctxRes.ctx
  if (!isMarketplaceSellerManager(role)) {
    return NextResponse.json({ error: 'Owner, admin, or mechanic required' }, { status: 403 })
  }

  const listing = await loadListing(service, params.id)
  if (!listing || String(listing.organization_id ?? '') !== organizationId) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  let body: { status?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const status = parseStatus(body.status)
  if (!status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 })
  }

  const account = await ensureMarketplaceSellerAccount(service, organizationId)
  const { data: plan } = await service
    .from('marketplace_seller_plans')
    .select('slug, name, active_listing_limit')
    .eq('slug', account.plan_slug)
    .single()

  const activeCount = await countMarketplacePartListings(service, organizationId)
  const isActivating = isActiveMarketplacePartStatus(status)
  const currentlyActive = isActiveMarketplacePartStatus(String(listing.status ?? ''))
  const effectiveActiveCount = currentlyActive ? Math.max(0, activeCount - 1) : activeCount
  if (isActivating && plan?.active_listing_limit != null && effectiveActiveCount >= plan.active_listing_limit) {
    return NextResponse.json(
      {
        error: `Plan limit reached. ${plan.name} allows ${plan.active_listing_limit} active listings.`,
      },
      { status: 409 }
    )
  }

  const { data, error } = await service
    .from('marketplace_part_listings')
    .update({
      status,
      published_at: isActivating ? (listing.published_at ?? new Date().toISOString()) : listing.published_at ?? null,
      archived_at: status === 'archived' ? new Date().toISOString() : status === 'draft' ? null : listing.archived_at ?? null,
      updated_at: new Date().toISOString(),
      seller_user_id: user.id,
    })
    .eq('id', params.id)
    .select('*')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to update status' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, listing: { ...data, listing_type: 'part' } })
}

