import { NextRequest, NextResponse } from 'next/server'
import {
  ensureMarketplaceSellerAccount,
  isActiveMarketplacePartStatus,
  isMarketplaceSellerManager,
  requireMarketplaceContext,
} from '../../../_shared'

type ListingStatus = 'draft' | 'available' | 'pending' | 'sold' | 'archived'
type ListingCondition = 'new' | 'new_surplus' | 'overhauled' | 'serviceable' | 'as_removed' | 'used' | 'for_repair'

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function toInt(value: unknown, fallback = 0) {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : fallback
}

function parseStatus(raw: unknown): ListingStatus | null {
  const value = String(raw)
  return ['draft', 'available', 'pending', 'sold', 'archived'].includes(value) ? (value as ListingStatus) : null
}

function parseCondition(raw: unknown): ListingCondition | null {
  const value = String(raw)
  return ['new', 'new_surplus', 'overhauled', 'serviceable', 'as_removed', 'used', 'for_repair'].includes(value)
    ? (value as ListingCondition)
    : null
}

async function loadListing(service: any, id: string) {
  const { data, error } = await service
    .from('marketplace_part_listings')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Record<string, unknown> | null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxRes = await requireMarketplaceContext()
  if (!ctxRes.ok) return ctxRes.response

  const { service, organizationId, user } = ctxRes.ctx
  const listing = await loadListing(service, params.id)
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  const orgId = String(listing.organization_id ?? '')
  const isOwnerOrg = orgId === organizationId
  const status = String(listing.status ?? '')

  if (!isOwnerOrg && status !== 'available') {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  await Promise.all([
    service
      .from('marketplace_part_listings')
      .update({
        view_count: toInt(listing.view_count, 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id),
    service.from('marketplace_part_contact_events').insert({
      listing_id: params.id,
      organization_id: orgId,
      user_id: user.id,
      channel: 'view',
      metadata_json: {
        source: 'marketplace_part_detail',
      },
    }),
  ])

  const { data: org } = await service
    .from('organizations')
    .select('id, name, slug')
    .eq('id', orgId)
    .maybeSingle()

  return NextResponse.json({
    listing: {
      ...listing,
      view_count: toInt(listing.view_count, 0) + 1,
      listing_type: 'part',
      organization_name: org?.name ?? org?.slug ?? null,
    },
  })
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

  const currentStatus = String(listing.status ?? 'draft')
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const targetPlan = await ensureMarketplaceSellerAccount(service, organizationId)
  const { data: plan } = await service
    .from('marketplace_seller_plans')
    .select('slug, name, active_listing_limit')
    .eq('slug', targetPlan.plan_slug)
    .single()

  const action =
    typeof body.action === 'string'
      ? (body.action as 'mark_sold' | 'relist' | 'archive' | 'mark_pending' | 'duplicate')
      : null

  if (action === 'duplicate') {
    const duplicatePatch = {
      organization_id: organizationId,
      seller_user_id: user.id,
      seller_plan_slug: targetPlan.plan_slug,
      title: `${String(listing.title ?? 'Part listing')} copy`,
      part_number: listing.part_number ?? null,
      alternate_part_number: listing.alternate_part_number ?? null,
      manufacturer: listing.manufacturer ?? null,
      category: listing.category ?? null,
      subcategory: listing.subcategory ?? null,
      condition: listing.condition ?? 'serviceable',
      fits_applicability: listing.fits_applicability ?? null,
      description: listing.description ?? null,
      seller_notes: listing.seller_notes ?? null,
      price_cents: listing.price_cents ?? null,
      quantity: listing.quantity ?? 1,
      location: listing.location ?? null,
      serial_number: null,
      trace_docs_available: Boolean(listing.trace_docs_available),
      cert_tag_available: Boolean(listing.cert_tag_available),
      contact_name: listing.contact_name ?? null,
      contact_phone: listing.contact_phone ?? null,
      contact_text: listing.contact_text ?? null,
      contact_email: listing.contact_email ?? null,
      media_json: Array.isArray(listing.media_json) ? listing.media_json : [],
      status: 'draft',
      featured_rank: 0,
      view_count: 0,
      contact_click_count: 0,
      call_click_count: 0,
      text_click_count: 0,
      email_click_count: 0,
      published_at: null,
      archived_at: null,
      last_contacted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data: duplicate, error: duplicateError } = await service
      .from('marketplace_part_listings')
      .insert(duplicatePatch)
      .select('*')
      .single()

    if (duplicateError || !duplicate) {
      return NextResponse.json({ error: duplicateError?.message || 'Failed to duplicate listing' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, duplicate })
  }

  const status = body.status != null ? parseStatus(body.status) : null
  if (body.status != null && !status) {
    return NextResponse.json({ error: 'Invalid listing status' }, { status: 400 })
  }

  const actionStatusMap: Record<string, ListingStatus> = {
    mark_sold: 'sold',
    relist: 'available',
    archive: 'archived',
    mark_pending: 'pending',
  }
  const effectiveStatus = status ?? (action ? actionStatusMap[action] ?? null : null)

  const condition = body.condition != null ? parseCondition(body.condition) : null
  if (body.condition != null && !condition) {
    return NextResponse.json({ error: 'Invalid condition' }, { status: 400 })
  }

  const { count: activeCountRaw, error: activeCountError } = await service
    .from('marketplace_part_listings')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .in('status', ['available', 'pending'])
    .neq('id', params.id)

  if (activeCountError) {
    return NextResponse.json({ error: activeCountError.message }, { status: 500 })
  }

  const activeCount = activeCountRaw ?? 0
  const activating = effectiveStatus
    ? isActiveMarketplacePartStatus(effectiveStatus)
    : isActiveMarketplacePartStatus(currentStatus)
  if (activating && plan?.active_listing_limit != null && activeCount >= plan.active_listing_limit) {
    return NextResponse.json(
      {
        error: `Plan limit reached. ${plan.name} allows ${plan.active_listing_limit} active listings.`,
      },
      { status: 409 }
    )
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    seller_user_id: user.id,
  }

  const allowedKeys: Record<string, string> = {
    title: 'title',
    partNumber: 'part_number',
    part_number: 'part_number',
    manufacturer: 'manufacturer',
    category: 'category',
    subcategory: 'subcategory',
    alternatePartNumber: 'alternate_part_number',
    alternate_part_number: 'alternate_part_number',
    fitsApplicability: 'fits_applicability',
    fits_applicability: 'fits_applicability',
    description: 'description',
    sellerNotes: 'seller_notes',
    seller_notes: 'seller_notes',
    location: 'location',
    serialNumber: 'serial_number',
    serial_number: 'serial_number',
    contactName: 'contact_name',
    contact_name: 'contact_name',
    contactPhone: 'contact_phone',
    contact_phone: 'contact_phone',
    contactText: 'contact_text',
    contact_text: 'contact_text',
    contactEmail: 'contact_email',
    contact_email: 'contact_email',
    featuredRank: 'featured_rank',
    featured_rank: 'featured_rank',
    priceCents: 'price_cents',
    price_cents: 'price_cents',
    quantity: 'quantity',
    traceDocsAvailable: 'trace_docs_available',
    trace_docs_available: 'trace_docs_available',
    certTagAvailable: 'cert_tag_available',
    cert_tag_available: 'cert_tag_available',
    mediaJson: 'media_json',
    media_json: 'media_json',
  }

  for (const [inputKey, dbKey] of Object.entries(allowedKeys)) {
    if (!(inputKey in body)) continue
    const value = body[inputKey]
    if (dbKey === 'price_cents' || dbKey === 'quantity' || dbKey === 'featured_rank') {
      patch[dbKey] = value == null ? null : toInt(value, 0)
    } else if (dbKey === 'trace_docs_available' || dbKey === 'cert_tag_available') {
      patch[dbKey] = Boolean(value)
    } else if (dbKey === 'media_json') {
      patch[dbKey] = Array.isArray(value) ? value : []
    } else {
      patch[dbKey] = normalizeText(value) || null
    }
  }

  if (effectiveStatus) {
    patch.status = effectiveStatus
    patch.published_at =
      effectiveStatus === 'available'
        ? (listing.published_at ?? new Date().toISOString())
        : effectiveStatus === 'draft'
          ? null
          : listing.published_at ?? null
    patch.archived_at =
      effectiveStatus === 'archived'
        ? new Date().toISOString()
        : effectiveStatus === 'available' || effectiveStatus === 'pending' || effectiveStatus === 'sold' || effectiveStatus === 'draft'
          ? null
          : (listing.archived_at ?? null)
  }

  if (condition) {
    patch.condition = condition
  }

  const { data, error } = await service
    .from('marketplace_part_listings')
    .update(patch)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to update listing' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, listing: { ...data, listing_type: 'part' } })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxRes = await requireMarketplaceContext()
  if (!ctxRes.ok) return ctxRes.response

  const { service, organizationId, role } = ctxRes.ctx
  if (!isMarketplaceSellerManager(role)) {
    return NextResponse.json({ error: 'Owner, admin, or mechanic required' }, { status: 403 })
  }

  const listing = await loadListing(service, params.id)
  if (!listing || String(listing.organization_id ?? '') !== organizationId) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  const { data, error } = await service
    .from('marketplace_part_listings')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('*')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to archive listing' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, listing: { ...data, listing_type: 'part' } })
}
