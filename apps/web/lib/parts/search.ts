// Parts search orchestrator: runs AI resolution + providers in parallel, normalizes, ranks, persists.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ProviderContext,
  ProviderResult,
  SearchResponse,
  ProviderId,
  AIResolutionInfo,
  LibraryMatch,
  PartsSearchFilters,
  RankedOffer,
} from './types'
import { classifySearchMode, normalizeQuery, buildProviderQuery, extractPartNumber } from './normalize'
import { rankOffers } from './ranking'
import { runSerpProvider } from './providers/serp'
import { runEbayProvider } from './providers/ebay'
import { runCuratedProvider } from './providers/curated'
import { resolvePartWithAI, type AircraftContext } from './ai-resolve'

export interface SearchInput {
  query: string
  organizationId: string
  aircraftId?: string | null
  workOrderId?: string | null
  maintenanceDraftId?: string | null
  userId: string
  aircraftMakeModel?: string | null
  aircraftYear?: number | null
  engineModel?: string | null
  maxResults?: number
  timeoutMs?: number
  /** Full aircraft context for AI resolution */
  aircraftContext?: AircraftContext | null
  /** Optional user-tunable filters applied after ranking. */
  filters?: PartsSearchFilters | null
}

export async function searchParts(
  supabase: SupabaseClient,
  input: SearchInput
): Promise<SearchResponse> {
  const query = input.query.trim()
  if (!query) throw new Error('Query is required')

  const normalized = normalizeQuery(query)
  const searchMode = classifySearchMode(normalized)

  // ─── AI Part Resolution ─────────────────────────────────────────────────────
  // If we have aircraft context and the query is plain English (not already a
  // part number), ask GPT-4o to resolve it to exact part number(s).
  let aiResolution: AIResolutionInfo | null = null
  let aiSearchQuery: string | null = null

  if (input.aircraftContext && searchMode !== 'exact_part') {
    try {
      const resolution = await resolvePartWithAI(normalized, input.aircraftContext)
      if (resolution && resolution.partNumbers.length > 0) {
        aiResolution = resolution
        aiSearchQuery = resolution.searchQuery
        console.log(`[parts-search] AI resolved "${normalized}" → P/N: ${resolution.partNumbers.join(', ')} | query: "${resolution.searchQuery}" (${resolution.confidence})`)
      }
    } catch (err: any) {
      console.error('[parts-search] AI resolution failed (continuing without):', err?.message)
    }
  }

  // Use the AI-optimized query if available, otherwise fall back to the old builder
  const providerQuery = aiSearchQuery ?? buildProviderQuery(normalized, {
    aircraftMakeModel: input.aircraftMakeModel,
    engineModel: input.engineModel,
    mode: searchMode,
  })

  // If AI resolved to exact P/N with high confidence, switch to exact_part mode
  const effectiveMode = (aiResolution?.confidence === 'high' && aiResolution.partNumbers.length > 0)
    ? 'exact_part' as const
    : searchMode

  console.log(`[parts-search] query="${input.query}" → normalized="${normalized}" mode=${effectiveMode} providerQuery="${providerQuery}" aircraft="${input.aircraftMakeModel ?? 'none'}" aiResolved=${!!aiResolution}`)

  const ctx: ProviderContext = {
    query: providerQuery,
    normalizedQuery: normalized,
    searchMode: effectiveMode,
    aircraftMakeModel: input.aircraftMakeModel,
    aircraftYear: input.aircraftYear,
    engineModel: input.engineModel,
    maxResults: input.maxResults ?? 30,
    timeoutMs: input.timeoutMs ?? 9000,
  }

  const [serp, ebay, curated] = await Promise.all([
    runSerpProvider(ctx).catch(e => errorResult('serpapi', e)),
    runEbayProvider(ctx).catch(e => errorResult('ebay', e)),
    runCuratedProvider(ctx).catch(e => errorResult('curated', e)),
  ])
  const providers: ProviderResult[] = [serp, ebay, curated]

  const allOffers = providers.flatMap(p => p.offers)
  console.log(`[parts-search] Provider totals: serp=${serp.offers.length} ebay=${ebay.offers.length} curated=${curated.offers.length} → ${allOffers.length} total offers`)

  // Use AI-resolved part number for ranking boost if available
  const queryPartNumber = (aiResolution?.partNumbers?.[0]) ?? extractPartNumber(normalized)
  const allRanked = rankOffers(allOffers, queryPartNumber)

  // When AI resolved with HIGH confidence, auto-enforce a strict P/N filter
  // (across primary + alternates) — irrelevant offers from generic searches
  // get hidden by default. User can clear via filters.partNumber = '' to widen.
  const autoStrictPN =
    aiResolution?.confidence === 'high' &&
    (aiResolution.partNumbers.length > 0 || aiResolution.alternates.length > 0) &&
    (input.filters?.partNumber === undefined)

  let strictFiltered: RankedOffer[] = allRanked
  if (autoStrictPN) {
    const pnSet = new Set(
      [...(aiResolution?.partNumbers ?? []), ...(aiResolution?.alternates ?? [])]
        .map((p) => p.toUpperCase())
        .filter(Boolean)
    )
    strictFiltered = allRanked.filter((o) => {
      const pn = (o.partNumber ?? '').toUpperCase()
      const titleUpper = o.title.toUpperCase()
      for (const candidate of pnSet) {
        if (pn.includes(candidate) || titleUpper.includes(candidate)) return true
      }
      return false
    })
    // If strict filter wipes all results, fall back to ranked list (rare —
    // means AI guessed a P/N that no vendor sells under that name).
    if (strictFiltered.length === 0) strictFiltered = allRanked
  }

  // Apply user filters (condition, price, shipping, brand, vendor bucket)
  const filtered = applyFilters(strictFiltered, input.filters ?? null)

  // Apply user sort (defaults to best_fit which is already rank order)
  const sortMode = input.filters?.sortBy ?? 'best_fit'
  const sorted = applySort(filtered, sortMode)

  const ranked = sorted.slice(0, ctx.maxResults)

  const providerSummary: Record<string, { ok: boolean; count: number; error?: string; durationMs: number }> = {}
  for (const p of providers) {
    providerSummary[p.provider] = {
      ok: p.ok,
      count: p.offers.length,
      error: p.error,
      durationMs: p.durationMs,
    }
  }

  const libraryMatches = await findLibraryMatches(supabase, input.organizationId, {
    normalizedQuery: normalized,
    resolvedPartNumbers: [
      ...(aiResolution?.partNumbers ?? []),
      ...(aiResolution?.alternates ?? []),
      ...(extractPartNumber(normalized) ? [extractPartNumber(normalized) as string] : []),
    ],
  })

  // Persist the search
  const { data: searchRow, error: searchErr } = await (supabase as any)
    .from('parts_searches')
    .insert({
      organization_id: input.organizationId,
      aircraft_id: input.aircraftId ?? null,
      maintenance_draft_id: input.maintenanceDraftId ?? null,
      search_query: normalized,
      normalized_query: normalized,
      search_mode: effectiveMode,
      provider_summary: providerSummary,
      result_count: ranked.length,
      created_by: input.userId,
    })
    .select('id')
    .single()

  if (searchErr || !searchRow) {
    throw new Error(`Failed to persist search: ${searchErr?.message ?? 'unknown'}`)
  }
  const searchId: string = searchRow.id

  // Persist offers in batch (cap at 80 to stay light)
  const offersToInsert = ranked.slice(0, 80).map(o => ({
    part_search_id: searchId,
    organization_id: input.organizationId,
    aircraft_id: input.aircraftId ?? null,
    work_order_id: input.workOrderId ?? null,
    provider: o.provider,
    source_type: o.sourceType,
    external_offer_id: o.externalOfferId ?? null,
    query_text: normalized,
    title: o.title,
    part_number: o.partNumber ?? null,
    brand: o.brand ?? null,
    description: o.description ?? null,
    image_url: o.imageUrl ?? null,
    product_url: o.productUrl,
    vendor_name: o.vendorName,
    vendor_domain: o.vendorDomain ?? null,
    vendor_location: o.vendorLocation ?? null,
    price: o.price ?? null,
    currency: o.currency ?? null,
    shipping_price: o.shippingPrice ?? null,
    total_estimated_price: o.totalEstimatedPrice ?? null,
    shipping_speed_label: o.shippingSpeedLabel ?? null,
    condition: o.condition ?? null,
    stock_label: o.stockLabel ?? null,
    rating: o.rating ?? null,
    rating_count: o.ratingCount ?? null,
    certifications: o.certifications ?? [],
    compatibility_text: o.compatibilityText ?? [],
    badges: o.badges ?? [],
    rank_score: o.rankScore,
    sort_bucket: o.sortBucket,
    raw_payload: o.rawPayload ?? {},
  }))

  if (offersToInsert.length > 0) {
    const { data: inserted, error: offersErr } = await (supabase as any)
      .from('part_offers')
      .insert(offersToInsert)
      .select('id')
    if (!offersErr && inserted) {
      // Attach db ids to ranked offers by position
      for (let i = 0; i < inserted.length; i++) {
        if (ranked[i]) ranked[i].id = inserted[i].id
      }
    }
  }

  return {
    searchId,
    query: normalized,
    searchMode: effectiveMode,
    offers: ranked,
    providerSummary: providerSummary as Record<ProviderId, { ok: boolean; count: number; error?: string; durationMs: number }>,
    resultCount: ranked.length,
    totalBeforeFilters: allRanked.length,
    aiResolution,
    libraryMatches,
  }
}

function errorResult(provider: ProviderId, err: any): ProviderResult {
  return { provider, ok: false, offers: [], error: err?.message ?? 'unknown', durationMs: 0 }
}

// ─── Filter & sort helpers ─────────────────────────────────────────────────
// Applied AFTER ranking. Keep these pure so we can unit-test them later.

function offerEffectivePrice(o: { price?: number | null; totalEstimatedPrice?: number | null }) {
  return typeof o.totalEstimatedPrice === 'number'
    ? o.totalEstimatedPrice
    : typeof o.price === 'number'
      ? o.price
      : null
}

function offerShippingDays(o: { shippingSpeedLabel?: string | null }): number | null {
  const label = (o.shippingSpeedLabel ?? '').toLowerCase()
  if (!label) return null
  if (/in[-\s]?stock|today|same[-\s]?day/.test(label)) return 0
  if (/next[-\s]?day|1[-\s]?day|overnight|express/.test(label)) return 1
  if (/2[-\s]?day|two[-\s]?day/.test(label)) return 2
  if (/3[-\s]?day|3 days/.test(label)) return 3
  if (/(\d+)[-\s]?(?:to[-\s]?\d+\s+)?days?/.exec(label)) {
    const m = /(\d+)[-\s]?days?/.exec(label)
    if (m) return Number.parseInt(m[1], 10)
  }
  if (/week/.test(label)) return 7
  if (/month/.test(label)) return 30
  return null
}

function applyFilters(
  offers: RankedOffer[],
  filters: PartsSearchFilters | null | undefined
): RankedOffer[] {
  if (!filters) return offers

  const cond = filters.condition ?? 'any'
  const minPrice = typeof filters.priceMin === 'number' ? filters.priceMin : null
  const maxPrice = typeof filters.priceMax === 'number' ? filters.priceMax : null
  const ship = filters.shipping ?? 'any'
  const vendorBucket = filters.vendorBucket ?? 'any'
  const brandFilter = (filters.brand ?? '').trim().toLowerCase()
  const pnFilter = (filters.partNumber ?? '').trim().toUpperCase()

  return offers.filter((o) => {
    // Condition (PMA = "new" w/ certifications mentioning PMA, otherwise any new)
    // Treat 'unknown' specially: most Google Shopping listings don't tag
    // condition, but they're typically new. So `new` filter accepts both
    // explicit 'new' AND 'unknown'. Used/refurbished/etc. are excluded
    // even when filter is 'new'.
    if (cond !== 'any') {
      const oc = (o.condition ?? 'unknown').toLowerCase()
      const certs = (o.certifications ?? []).join(' ').toLowerCase()
      if (cond === 'pma') {
        if (!(certs.includes('pma') || /pma/i.test(o.title))) return false
      } else if (cond === 'new') {
        if (oc !== 'new' && oc !== 'unknown') return false
      } else if (oc !== cond) {
        return false
      }
    }

    // Price
    const eff = offerEffectivePrice(o)
    if (minPrice != null && (eff == null || eff < minPrice)) return false
    if (maxPrice != null && (eff == null || eff > maxPrice)) return false

    // Shipping
    if (ship !== 'any') {
      if (ship === 'in_stock') {
        const stock = (o.stockLabel ?? '').toLowerCase()
        if (!stock.includes('in stock')) return false
      } else {
        const days = offerShippingDays(o)
        if (days == null) return false
        if (ship === 'next_day' && days > 1) return false
        if (ship === 'two_day' && days > 2) return false
        if (ship === 'this_week' && days > 7) return false
      }
    }

    // Vendor bucket
    if (vendorBucket === 'aviation_trusted' && o.sortBucket !== 'aviation_trusted') {
      return false
    }

    // Brand
    if (brandFilter) {
      const haystack = `${o.brand ?? ''} ${o.title}`.toLowerCase()
      if (!haystack.includes(brandFilter)) return false
    }

    // Strict part-number filter (used when AI resolution is high-confidence)
    if (pnFilter) {
      const pn = (o.partNumber ?? '').toUpperCase()
      const inTitle = o.title.toUpperCase()
      if (!pn.includes(pnFilter) && !inTitle.includes(pnFilter)) return false
    }

    return true
  })
}

function applySort(offers: RankedOffer[], mode: 'best_fit' | 'price_asc' | 'price_desc' | 'fastest' | 'highest_rated'): RankedOffer[] {
  const sorted = [...offers]
  switch (mode) {
    case 'price_asc':
      sorted.sort((a, b) => {
        const ap = offerEffectivePrice(a) ?? Infinity
        const bp = offerEffectivePrice(b) ?? Infinity
        return ap - bp
      })
      break
    case 'price_desc':
      sorted.sort((a, b) => {
        const ap = offerEffectivePrice(a) ?? -Infinity
        const bp = offerEffectivePrice(b) ?? -Infinity
        return bp - ap
      })
      break
    case 'fastest':
      sorted.sort((a, b) => {
        const ad = offerShippingDays(a) ?? 999
        const bd = offerShippingDays(b) ?? 999
        return ad - bd
      })
      break
    case 'highest_rated':
      sorted.sort((a, b) => {
        const ar = (a.rating ?? 0) * Math.log10(2 + (a.ratingCount ?? 0))
        const br = (b.rating ?? 0) * Math.log10(2 + (b.ratingCount ?? 0))
        return br - ar
      })
      break
    case 'best_fit':
    default:
      // Already in rank order from rankOffers. No-op.
      break
  }
  return sorted
}

function computeSellPrice(part: {
  base_price: number | null
  markup_mode: string | null
  markup_percent: number | null
  custom_rate: number | null
}): number | null {
  const base = part.base_price
  if (base == null) return null

  switch (part.markup_mode) {
    case 'percent':
      return Math.round(base * (1 + (part.markup_percent ?? 0) / 100) * 100) / 100
    case 'custom_rate':
      return part.custom_rate != null ? Math.round(part.custom_rate * 100) / 100 : base
    default:
      return base
  }
}

function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,%]/g, ' ').trim()
}

async function findLibraryMatches(
  supabase: SupabaseClient,
  organizationId: string,
  input: {
    normalizedQuery: string
    resolvedPartNumbers: string[]
  }
): Promise<LibraryMatch[]> {
  const normalizedPartNumbers = Array.from(
    new Set(
      input.resolvedPartNumbers
        .map(partNumber => normalizeQuery(partNumber).toUpperCase())
        .filter(Boolean)
    )
  )

  const searchTerms = Array.from(
    new Set([
      ...normalizedPartNumbers,
      ...input.normalizedQuery
        .split(/\s+/)
        .map(term => sanitizeSearchTerm(term))
        .filter(term => term.length >= 3)
        .slice(0, 5),
    ])
  ).slice(0, 8)

  const orClauses = searchTerms.flatMap(term => ([
    `part_number.ilike.%${term}%`,
    `title.ilike.%${term}%`,
    `description.ilike.%${term}%`,
    `preferred_vendor.ilike.%${term}%`,
  ]))

  let query: any = (supabase as any)
    .from('parts_library')
    .select(`
      id,
      part_number,
      title,
      description,
      category,
      preferred_vendor,
      vendor_url,
      image_url,
      condition,
      base_price,
      currency,
      markup_mode,
      markup_percent,
      custom_rate,
      usage_count,
      last_ordered_at
    `)
    .eq('organization_id', organizationId)
    .order('usage_count', { ascending: false })
    .order('last_ordered_at', { ascending: false, nullsFirst: false })
    .limit(24)

  if (orClauses.length > 0) {
    query = query.or(orClauses.join(','))
  }

  const { data, error } = await query
  if (error || !data) {
    if (error) {
      console.warn('[parts-search] library match lookup failed:', error.message)
    }
    return []
  }

  const normalizedQueryUpper = input.normalizedQuery.toUpperCase()

  return (data as any[])
    .map((part) => {
      const partNumber = String(part.part_number ?? '').toUpperCase()
      const title = String(part.title ?? '')
      const description = String(part.description ?? '')
      const vendor = String(part.preferred_vendor ?? '')

      let score = 0
      let matchReason: LibraryMatch['matchReason'] = 'recent'

      if (normalizedPartNumbers.some(candidate => candidate === partNumber)) {
        score += 200
        matchReason = 'part_number'
      } else if (normalizedPartNumbers.some(candidate => partNumber.includes(candidate) || candidate.includes(partNumber))) {
        score += 120
        matchReason = 'part_number'
      } else if (title.toUpperCase().includes(normalizedQueryUpper)) {
        score += 60
        matchReason = 'title'
      } else if (description.toUpperCase().includes(normalizedQueryUpper)) {
        score += 40
        matchReason = 'description'
      } else if (vendor.toUpperCase().includes(normalizedQueryUpper)) {
        score += 20
        matchReason = 'vendor'
      }

      score += Math.min(Number(part.usage_count ?? 0) * 4, 32)
      if (part.last_ordered_at) score += 10

      return {
        score,
        match: {
          id: part.id,
          partNumber: part.part_number,
          title: part.title,
          category: part.category,
          preferredVendor: part.preferred_vendor,
          vendorUrl: part.vendor_url,
          imageUrl: part.image_url,
          condition: part.condition,
          basePrice: part.base_price,
          sellPrice: computeSellPrice(part),
          currency: part.currency,
          usageCount: Number(part.usage_count ?? 0),
          lastOrderedAt: part.last_ordered_at,
          matchReason,
        } satisfies LibraryMatch,
      }
    })
    .filter(entry => entry.score > 0 || entry.match.usageCount > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map(entry => entry.match)
}
