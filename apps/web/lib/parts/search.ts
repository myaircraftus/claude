// Parts search orchestrator: runs providers in parallel, normalizes, ranks, persists.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ProviderContext,
  ProviderResult,
  RankedOffer,
  SearchResponse,
  ProviderId,
} from './types'
import { classifySearchMode, normalizeQuery, buildProviderQuery, extractPartNumber } from './normalize'
import { rankOffers } from './ranking'
import { runSerpProvider } from './providers/serp'
import { runEbayProvider } from './providers/ebay'
import { runCuratedProvider } from './providers/curated'

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
}

export async function searchParts(
  supabase: SupabaseClient,
  input: SearchInput
): Promise<SearchResponse> {
  const query = input.query.trim()
  if (!query) throw new Error('Query is required')

  const normalized = normalizeQuery(query)
  const searchMode = classifySearchMode(normalized)
  const providerQuery = buildProviderQuery(normalized, {
    aircraftMakeModel: input.aircraftMakeModel,
    engineModel: input.engineModel,
    mode: searchMode,
  })

  const ctx: ProviderContext = {
    query: providerQuery,
    normalizedQuery: normalized,
    searchMode,
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
  const queryPartNumber = extractPartNumber(normalized)
  const ranked = rankOffers(allOffers, queryPartNumber).slice(0, ctx.maxResults)

  const providerSummary: Record<string, { ok: boolean; count: number; error?: string; durationMs: number }> = {}
  for (const p of providers) {
    providerSummary[p.provider] = {
      ok: p.ok,
      count: p.offers.length,
      error: p.error,
      durationMs: p.durationMs,
    }
  }

  // Persist the search
  const { data: searchRow, error: searchErr } = await (supabase as any)
    .from('parts_searches')
    .insert({
      organization_id: input.organizationId,
      aircraft_id: input.aircraftId ?? null,
      work_order_id: input.workOrderId ?? null,
      maintenance_draft_id: input.maintenanceDraftId ?? null,
      query: normalized,
      normalized_query: normalized,
      search_mode: searchMode,
      provider_summary: providerSummary,
      result_count: ranked.length,
      created_by: input.userId,
      results: [], // legacy column kept empty; real offers live in part_offers
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
    searchMode,
    offers: ranked,
    providerSummary: providerSummary as Record<ProviderId, { ok: boolean; count: number; error?: string; durationMs: number }>,
    resultCount: ranked.length,
  }
}

function errorResult(provider: ProviderId, err: any): ProviderResult {
  return { provider, ok: false, offers: [], error: err?.message ?? 'unknown', durationMs: 0 }
}
