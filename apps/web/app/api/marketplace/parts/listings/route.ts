import { NextRequest, NextResponse } from 'next/server'
import {
  countMarketplacePartListings,
  ensureMarketplaceSellerAccount,
  isActiveMarketplacePartStatus,
  isMarketplaceSellerManager,
  requireMarketplaceContext,
} from '../../_shared'

type ListingStatus = 'draft' | 'available' | 'pending' | 'sold' | 'archived'
type ListingCondition = 'new' | 'new_surplus' | 'overhauled' | 'serviceable' | 'as_removed' | 'used' | 'for_repair'

const ALLOWED_SORTS = new Set(['newest', 'relevance', 'price_asc', 'price_desc', 'most_viewed'])

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function toInt(value: unknown, fallback = 0) {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : fallback
}

function parseStatus(raw: unknown): ListingStatus {
  return ['draft', 'available', 'pending', 'sold', 'archived'].includes(String(raw))
    ? (String(raw) as ListingStatus)
    : 'draft'
}

function parseCondition(raw: unknown): ListingCondition {
  return ['new', 'new_surplus', 'overhauled', 'serviceable', 'as_removed', 'used', 'for_repair'].includes(
    String(raw)
  )
    ? (String(raw) as ListingCondition)
    : 'serviceable'
}

function normalizeMediaJson(raw: unknown) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function buildSearchText(row: Record<string, unknown>) {
  return [
    row.title,
    row.part_number,
    row.manufacturer,
    row.category,
    row.subcategory,
    row.description,
    row.seller_notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export async function GET(req: NextRequest) {
  const ctxRes = await requireMarketplaceContext()
  if (!ctxRes.ok) return ctxRes.response

  const { service, organizationId } = ctxRes.ctx
  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') ?? 'browse'
  const q = normalizeText(url.searchParams.get('q')).toLowerCase()
  const category = normalizeText(url.searchParams.get('category'))
  const manufacturer = normalizeText(url.searchParams.get('manufacturer'))
  const condition = normalizeText(url.searchParams.get('condition'))
  const statusParam = normalizeText(url.searchParams.get('status'))
  const sort = ALLOWED_SORTS.has(url.searchParams.get('sort') ?? '') ? (url.searchParams.get('sort') as string) : 'relevance'
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? (scope === 'browse' ? 48 : 200)), 1), 500)

  let query = (service as any)
    .from('marketplace_part_listings')
    .select('*')
    .order('featured_rank', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (scope === 'seller' || scope === 'dashboard') {
    query = query.eq('organization_id', organizationId)
  } else {
    query = query.eq('status', 'available')
  }

  if (statusParam && ['draft', 'available', 'pending', 'sold', 'archived'].includes(statusParam)) {
    query = query.eq('status', statusParam)
  }

  if (category) query = query.eq('category', category)
  if (manufacturer) query = query.eq('manufacturer', manufacturer)
  if (condition && ['new', 'new_surplus', 'overhauled', 'serviceable', 'as_removed', 'used', 'for_repair'].includes(condition)) {
    query = query.eq('condition', condition)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>
  const filtered = q
    ? rows.filter((row) => buildSearchText(row).includes(q))
    : rows

  const sorted = [...filtered].sort((a, b) => {
    const aPrice = Number(a.price_cents ?? 0)
    const bPrice = Number(b.price_cents ?? 0)
    const aViews = Number(a.view_count ?? 0)
    const bViews = Number(b.view_count ?? 0)
    const aDate = new Date(String(a.created_at ?? 0)).getTime()
    const bDate = new Date(String(b.created_at ?? 0)).getTime()
    const aFeatured = Number(a.featured_rank ?? 0)
    const bFeatured = Number(b.featured_rank ?? 0)

    switch (sort) {
      case 'newest':
        return bDate - aDate
      case 'price_asc':
        return aPrice - bPrice
      case 'price_desc':
        return bPrice - aPrice
      case 'most_viewed':
        return bViews - aViews
      case 'relevance':
      default:
        return bFeatured - aFeatured || bViews - aViews || bDate - aDate
    }
  })

  const orgIds = Array.from(new Set(sorted.map((row) => String(row.organization_id ?? '')).filter(Boolean)))
  const orgNames = new Map<string, string>()
  if (orgIds.length > 0) {
    const { data: orgRows } = await (service as any)
      .from('organizations')
      .select('id, name, slug')
      .in('id', orgIds)
    for (const org of orgRows ?? []) {
      orgNames.set(org.id, org.name ?? org.slug ?? 'Marketplace seller')
    }
  }

  const items = sorted.map((row) => ({
    ...row,
    listing_type: 'part',
    organization_name: orgNames.get(String(row.organization_id ?? '')) ?? null,
  }))

  const summary = {
    total: rows.length,
    filtered: filtered.length,
    active: rows.filter((row) => isActiveMarketplacePartStatus(String(row.status ?? ''))).length,
    available: rows.filter((row) => String(row.status ?? '') === 'available').length,
    pending: rows.filter((row) => String(row.status ?? '') === 'pending').length,
    sold: rows.filter((row) => String(row.status ?? '') === 'sold').length,
    archived: rows.filter((row) => String(row.status ?? '') === 'archived').length,
    total_views: rows.reduce((sum, row) => sum + toInt(row.view_count), 0),
    total_contacts: rows.reduce((sum, row) => sum + toInt(row.contact_click_count), 0),
    call_clicks: rows.reduce((sum, row) => sum + toInt(row.call_click_count), 0),
    text_clicks: rows.reduce((sum, row) => sum + toInt(row.text_click_count), 0),
    email_clicks: rows.reduce((sum, row) => sum + toInt(row.email_click_count), 0),
  }

  if (scope === 'seller' || scope === 'dashboard') {
    const account = await ensureMarketplaceSellerAccount(service, organizationId)
    const { data: plan } = await (service as any)
      .from('marketplace_seller_plans')
      .select(
        'slug, name, monthly_price_cents, annual_price_cents, active_listing_limit, supports_ai_listing_creation, supports_photo_upload, supports_video_upload, supports_priority_ranking, supports_advanced_analytics, supports_direct_contact, description'
      )
      .eq('slug', account.plan_slug)
      .single()

    return NextResponse.json({
      items,
      summary: {
        ...summary,
        plan,
        active_listing_limit: plan?.active_listing_limit ?? null,
        remaining_active_listings:
          plan?.active_listing_limit == null
            ? null
            : Math.max(0, plan.active_listing_limit - summary.active),
      },
    })
  }

  return NextResponse.json({ items, summary })
}

export async function POST(req: NextRequest) {
  const ctxRes = await requireMarketplaceContext()
  if (!ctxRes.ok) return ctxRes.response

  const { service, organizationId, role, user } = ctxRes.ctx
  if (!isMarketplaceSellerManager(role)) {
    return NextResponse.json({ error: 'Owner, admin, or mechanic required' }, { status: 403 })
  }

  const account = await ensureMarketplaceSellerAccount(service, organizationId)
  const { data: currentPlan } = await (service as any)
    .from('marketplace_seller_plans')
    .select('slug, name, active_listing_limit')
    .eq('slug', account.plan_slug)
    .single()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const status = parseStatus(body.status)
  const activeCount = await countMarketplacePartListings(service, organizationId)
  const activating = isActiveMarketplacePartStatus(status)
  if (activating && currentPlan?.active_listing_limit != null && activeCount >= currentPlan.active_listing_limit) {
    return NextResponse.json(
      {
        error: `Plan limit reached. ${currentPlan.name} allows ${currentPlan.active_listing_limit} active listings.`,
      },
      { status: 409 }
    )
  }

  const payload = {
    organization_id: organizationId,
    seller_user_id: user.id,
    seller_plan_slug: account.plan_slug,
    title: normalizeText(body.title),
    part_number: normalizeText(body.partNumber ?? body.part_number) || null,
    alternate_part_number:
      normalizeText(body.alternatePartNumber ?? body.alternate_part_number) || null,
    manufacturer: normalizeText(body.manufacturer) || null,
    category: normalizeText(body.category) || null,
    subcategory: normalizeText(body.subcategory) || null,
    condition: parseCondition(body.condition),
    fits_applicability:
      normalizeText(body.fitsApplicability ?? body.fits_applicability) || null,
    description: normalizeText(body.description) || null,
    seller_notes: normalizeText(body.sellerNotes ?? body.seller_notes) || null,
    price_cents: body.priceCents != null ? toInt(body.priceCents, 0) : body.price_cents != null ? toInt(body.price_cents, 0) : null,
    quantity: Math.max(0, toInt(body.quantity, 1)),
    location: normalizeText(body.location) || null,
    serial_number: normalizeText(body.serialNumber ?? body.serial_number) || null,
    trace_docs_available: Boolean(body.traceDocsAvailable ?? body.trace_docs_available),
    cert_tag_available: Boolean(body.certTagAvailable ?? body.cert_tag_available),
    contact_name: normalizeText(body.contactName ?? body.contact_name) || null,
    contact_phone: normalizeText(body.contactPhone ?? body.contact_phone) || null,
    contact_text: normalizeText(body.contactText ?? body.contact_text) || null,
    contact_email: normalizeText(body.contactEmail ?? body.contact_email) || null,
    media_json: normalizeMediaJson(body.mediaJson ?? body.media_json),
    status,
    featured_rank: toInt(body.featuredRank ?? body.featured_rank, 0),
    published_at: activating ? new Date().toISOString() : null,
    archived_at: status === 'archived' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  if (!payload.title || !payload.category) {
    return NextResponse.json({ error: 'title and category are required' }, { status: 400 })
  }

  const { data, error } = await (service as any)
    .from('marketplace_part_listings')
    .insert(payload)
    .select('*')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to create listing' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, listing: { ...data, listing_type: 'part' } }, { status: 201 })
}
