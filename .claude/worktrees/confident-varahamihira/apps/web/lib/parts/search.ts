import { createServerSupabase } from '@/lib/supabase/server'
import { classifyQuery, deduplicateOffers } from './normalize'
import { rankOffers } from './ranking'
import { serpProvider } from './providers/serp'
import { ebayProvider } from './providers/ebay'
import { curatedProvider } from './providers/curated'
import type {
  PartSearchInput,
  PartSortMode,
  NormalizedPartOffer,
  PartSearchResponse,
  PartSearchProvider,
} from './types'

const PROVIDERS: PartSearchProvider[] = [serpProvider, ebayProvider, curatedProvider]

interface RunSearchOptions {
  organizationId: string
  userId: string
  input: PartSearchInput
  sortMode?: PartSortMode
}

export async function runPartsSearch({
  organizationId,
  userId,
  input,
  sortMode = 'best_match',
}: RunSearchOptions): Promise<PartSearchResponse> {
  const supabase = createServerSupabase()

  // Classify query to determine search_mode
  const queryType = classifyQuery(input.query)
  const searchMode = queryType === 'exact_part'
    ? 'exact_part'
    : queryType === 'likely_part'
    ? 'keyword'
    : queryType === 'contextual'
    ? 'contextual'
    : 'general'

  // Call all providers in parallel; catch individual failures gracefully
  const providerResults = await Promise.allSettled(
    PROVIDERS.map(p => p.search(input).then(offers => ({ provider: p.name, offers })))
  )

  const allOffers: NormalizedPartOffer[] = []
  const providersUsed: string[] = []
  const providersFailed: string[] = []
  const providerSummary: Record<string, { count: number; error?: string }> = {}

  for (let i = 0; i < providerResults.length; i++) {
    const result = providerResults[i]
    const providerName = PROVIDERS[i].name
    if (result.status === 'fulfilled') {
      const { provider, offers } = result.value
      providersUsed.push(provider)
      providerSummary[provider] = { count: offers.length }
      allOffers.push(...offers.map(o => ({ ...o, rankScore: 0, sortBucket: '' })))
    } else {
      const err = result.reason as Error
      console.error(`[parts/search] provider failure [${providerName}]`, err.message)
      providersFailed.push(providerName)
      providerSummary[providerName] = { count: 0, error: err.message }
    }
  }

  // Deduplicate + rank
  const deduped = deduplicateOffers(allOffers)
  const ranked = rankOffers(deduped, input.query, sortMode)

  // Persist search record
  const { data: searchRecord } = await supabase
    .from('atlas_part_searches')
    .insert({
      organization_id: organizationId,
      aircraft_id: input.aircraftContext?.aircraftId ?? null,
      work_order_id: input.workOrderId ?? null,
      user_id: userId,
      query_text: input.query,
      normalized_query: input.query.trim().toLowerCase(),
      search_mode: searchMode,
      provider_summary: providerSummary,
      result_count: ranked.length,
    })
    .select('id')
    .single()

  if (!searchRecord) {
    // Return results even if persistence fails
    return buildResponse('tmp-' + Date.now(), input.query, ranked, providersUsed, providersFailed)
  }

  // Persist offers (batch insert, limited to 50 to avoid payload limits)
  const offersToInsert = ranked.slice(0, 50).map(offer => ({
    part_search_id: searchRecord.id,
    organization_id: organizationId,
    aircraft_id: input.aircraftContext?.aircraftId ?? null,
    work_order_id: input.workOrderId ?? null,
    provider: offer.provider,
    source_type: offer.sourceType,
    external_offer_id: offer.id,
    query_text: input.query,
    title: offer.title,
    part_number: offer.partNumber ?? null,
    brand: offer.brand ?? null,
    description: offer.description ?? null,
    image_url: offer.imageUrl ?? null,
    product_url: offer.productUrl,
    vendor_name: offer.vendorName,
    vendor_domain: offer.vendorDomain ?? null,
    vendor_location: offer.vendorLocation ?? null,
    price: offer.price ?? null,
    currency: offer.currency ?? null,
    shipping_price: offer.shippingPrice ?? null,
    total_estimated_price: offer.totalEstimatedPrice ?? null,
    shipping_speed_label: offer.shippingSpeedLabel ?? null,
    condition: offer.condition ?? null,
    stock_label: offer.stockLabel ?? null,
    rating: offer.rating ?? null,
    rating_count: offer.ratingCount ?? null,
    certifications: offer.certifications ?? [],
    compatibility_text: offer.compatibilityText ?? [],
    badges: offer.badges ?? [],
    rank_score: offer.rankScore,
    sort_bucket: offer.sortBucket,
    raw_payload: offer.rawPayload as Record<string, unknown>,
  }))

  if (offersToInsert.length > 0) {
    await supabase.from('atlas_part_offers').insert(offersToInsert)
  }

  return buildResponse(searchRecord.id, input.query, ranked, providersUsed, providersFailed)
}

function buildResponse(
  searchId: string,
  query: string,
  ranked: NormalizedPartOffer[],
  providersUsed: string[],
  providersFailed: string[]
): PartSearchResponse {
  const prices = ranked.map(o => o.totalEstimatedPrice ?? o.price).filter((p): p is number => p != null)
  const bestPrice = prices.length > 0 ? Math.min(...prices) : undefined

  const fastestOffer = ranked.find(o => o.shippingSpeedLabel)
  const fastestDeliveryLabel = fastestOffer?.shippingSpeedLabel

  return {
    searchId,
    query,
    offers: ranked,
    summary: {
      count: ranked.length,
      providersUsed,
      providersFailed,
      bestPrice,
      fastestDeliveryLabel,
    },
  }
}
