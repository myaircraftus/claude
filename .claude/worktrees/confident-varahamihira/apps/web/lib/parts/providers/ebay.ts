import { normalizeCondition, extractDomain } from '../normalize'
import { extractPartNumber } from './serp'
import type { ExternalPartOffer, PartSearchInput, PartSearchProvider } from '../types'

const PROVIDER_TIMEOUT_MS = 12_000
const EBAY_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token'
const EBAY_SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
const EBAY_SANDBOX_TOKEN_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
const EBAY_SANDBOX_SEARCH_URL = 'https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search'

// Module-level token cache (survives across requests in the same worker process)
let cachedToken: { token: string; expiresAt: number } | null = null

async function getEbayToken(): Promise<string | null> {
  const clientId = process.env.EBAY_CLIENT_ID
  const clientSecret = process.env.EBAY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  // Use cached token if still valid (with 2-minute refresh buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 120_000) {
    return cachedToken.token
  }

  const isSandbox = process.env.EBAY_ENV === 'sandbox'
  const tokenUrl = isSandbox ? EBAY_SANDBOX_TOKEN_URL : EBAY_TOKEN_URL
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  try {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[ebay] token fetch failed', res.status, body.slice(0, 200))
      return null
    }

    const json = await res.json() as { access_token: string; expires_in: number }
    cachedToken = {
      token: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    }
    return cachedToken.token
  } catch (err) {
    console.error('[ebay] token error', (err as Error).message)
    return null
  }
}

// ─── eBay Browse API Provider ─────────────────────────────────────────────────
// Targets Aircraft Parts & Accessories (category 26429) for aviation relevance.
// Also runs a broader uncategorized search in parallel when query is descriptive,
// to catch parts sold outside the aviation category.

export const ebayProvider: PartSearchProvider = {
  name: 'ebay',

  async search(input: PartSearchInput): Promise<ExternalPartOffer[]> {
    if (!process.env.EBAY_CLIENT_ID) {
      console.warn('[ebay] EBAY_CLIENT_ID not set — skipping')
      return []
    }

    const token = await getEbayToken()
    if (!token) return []

    const isSandbox = process.env.EBAY_ENV === 'sandbox'
    const searchUrl = isSandbox ? EBAY_SANDBOX_SEARCH_URL : EBAY_SEARCH_URL

    const query = input.query.trim()

    // Build condition filter if requested
    const conditionFilter = buildConditionFilter(input.filters?.condition)

    // Run aviation-category search always; run broad search when no category match expected
    const [aviationResults, broadResults] = await Promise.all([
      fetchEbay(searchUrl, token, query, '26429', conditionFilter),
      // Broad search (no category) only if aviation category returns < 5 results
      // We don't know ahead of time, so always fetch both and merge
      fetchEbay(searchUrl, token, query, undefined, conditionFilter),
    ])

    // Merge: aviation-category results first, then any broad results not already covered
    const seen = new Set(aviationResults.map(o => o.productUrl))
    const deduped = [
      ...aviationResults,
      ...broadResults.filter(o => !seen.has(o.productUrl)),
    ]

    return deduped.slice(0, 25)
  },
}

async function fetchEbay(
  searchUrl: string,
  token: string,
  query: string,
  categoryId: string | undefined,
  conditionFilter: string | null
): Promise<ExternalPartOffer[]> {
  const url = new URL(searchUrl)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '15')
  // EXTENDED adds localizedAspects, estimatedAvailabilities, additionalImages,
  // qualifiedPrograms, topRatedBuyingExperience — all required for our extraction helpers
  url.searchParams.set('fieldgroups', 'EXTENDED')

  if (categoryId) url.searchParams.set('category_ids', categoryId)

  // Build filter string
  const filters: string[] = []
  if (conditionFilter) filters.push(`conditions:{${conditionFilter}}`)
  // Only US marketplace
  filters.push('deliveryCountry:US')
  if (filters.length) url.searchParams.set('filter', filters.join(','))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[ebay] search failed', res.status, body.slice(0, 200))
      return []
    }

    const json = await res.json() as {
      itemSummaries?: unknown[]
      total?: number
      warnings?: unknown[]
    }

    const items = (json.itemSummaries ?? []) as Record<string, unknown>[]

    return items.map((item): ExternalPartOffer => {
      const priceObj = item.price as { value?: string; currency?: string } | undefined
      const price = priceObj?.value ? parseFloat(priceObj.value) : undefined
      const currency = priceObj?.currency ?? 'USD'
      const shippingCost = extractEbayShipping(item)
      const totalEstimatedPrice =
        price != null && shippingCost != null
          ? price + shippingCost
          : price
      const productUrl = String(item.itemWebUrl ?? '')
      const titleStr = String(item.title ?? '')

      return {
        id: crypto.randomUUID(),
        provider: 'ebay',
        sourceType: 'marketplace',
        query,
        title: titleStr,
        partNumber: extractEbayPartNumber(item, query),
        brand: extractEbayBrand(item),
        description: undefined,
        imageUrl: extractEbayImage(item),
        productUrl,
        vendorName: extractEbaySeller(item),
        vendorDomain: 'ebay.com',
        price,
        currency,
        shippingPrice: shippingCost,
        totalEstimatedPrice,
        shippingSpeedLabel: extractEbayShippingLabel(item),
        condition: normalizeCondition(extractEbayConditionStr(item)),
        stockLabel: extractEbayStockLabel(item),
        rating: extractEbayRating(item),
        ratingCount: undefined,
        certifications: extractEbayCertifications(item),
        compatibilityText: [],
        badges: extractEbayBadges(item),
        rawPayload: item,
      }
    })
  } catch (err) {
    clearTimeout(timeout)
    if ((err as Error).name === 'AbortError') {
      console.error('[ebay] request timed out after', PROVIDER_TIMEOUT_MS, 'ms')
    } else {
      console.error('[ebay] fetch error', (err as Error).message)
    }
    return []
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildConditionFilter(conditions?: string[]): string | null {
  if (!conditions?.length) return null
  const map: Record<string, string> = {
    new: 'NEW',
    used: 'USED',
    overhauled: 'USED',
    serviceable: 'USED',
  }
  // Deduplicate: overhauled + serviceable both map to USED — avoid conditions:{USED|USED}
  const mapped = Array.from(new Set(conditions.map(c => map[c]).filter(Boolean)))
  return mapped.length ? mapped.join('|') : null
}

function extractEbayImage(item: Record<string, unknown>): string | undefined {
  const img = item.image as { imageUrl?: string } | undefined
  if (img?.imageUrl) return img.imageUrl
  // Fallback to additional images
  const additional = item.additionalImages as Array<{ imageUrl?: string }> | undefined
  return additional?.[0]?.imageUrl
}

function extractEbaySeller(item: Record<string, unknown>): string {
  const seller = item.seller as { username?: string } | undefined
  return seller?.username ? `${seller.username} (eBay)` : 'eBay Seller'
}

function extractEbayShipping(item: Record<string, unknown>): number | undefined {
  const options = item.shippingOptions as Array<{
    shippingCost?: { value?: string; currency?: string }
    type?: string
  }> | undefined
  if (!options?.length) return undefined

  // Prefer free shipping options
  const freeOption = options.find(o => o.type === 'FREE_SHIPPING' || o.shippingCost?.value === '0.0')
  if (freeOption) return 0

  const cost = options[0].shippingCost?.value
  if (cost === undefined || cost === null) return undefined
  const val = parseFloat(cost)
  return isNaN(val) ? undefined : val
}

function extractEbayShippingLabel(item: Record<string, unknown>): string | undefined {
  const options = item.shippingOptions as Array<{
    shippingServiceCode?: string
    shippingCost?: { value?: string; currency?: string }
    minEstimatedDeliveryDate?: string
    maxEstimatedDeliveryDate?: string
    type?: string
  }> | undefined
  if (!options?.length) return undefined

  const opt = options[0]
  if (opt.type === 'FREE_SHIPPING' || opt.shippingCost?.value === '0.0') return 'Free shipping'
  const svc = opt.shippingServiceCode ?? ''
  if (svc.includes('Expedited') || svc.includes('Express')) return 'Expedited shipping'
  if (svc.includes('Economy')) return 'Economy shipping'
  if (opt.minEstimatedDeliveryDate) return 'Standard shipping'
  return undefined
}

function extractEbayConditionStr(item: Record<string, unknown>): string | undefined {
  // eBay returns condition as "NEW", "USED", "CERTIFIED_REFURBISHED" etc.
  return item.condition as string | undefined
}

function extractEbayStockLabel(item: Record<string, unknown>): string | undefined {
  const qty = item.estimatedAvailabilities as Array<{
    estimatedAvailabilityStatus?: string
    estimatedSoldQuantity?: number
    estimatedRemainingQuantity?: number
  }> | undefined
  if (!qty?.length) return undefined
  const status = qty[0].estimatedAvailabilityStatus
  if (status === 'IN_STOCK') return 'In stock'
  if (status === 'LIMITED_STOCK') return 'Limited stock'
  if (status === 'OUT_OF_STOCK') return 'Out of stock'
  return undefined
}

function extractEbayRating(item: Record<string, unknown>): number | undefined {
  const seller = item.seller as {
    feedbackPercentage?: string
    feedbackScore?: number
  } | undefined
  if (!seller?.feedbackPercentage) return undefined
  const pct = parseFloat(seller.feedbackPercentage)
  if (isNaN(pct)) return undefined
  return Math.round((pct / 20) * 10) / 10 // 0-100% → 0-5 stars, 1 decimal
}

function extractEbayBrand(item: Record<string, unknown>): string | undefined {
  const aspects = item.localizedAspects as Array<{ name: string; value: string[] }> | undefined
  if (!aspects) return undefined
  const brand = aspects.find(a => a.name.toLowerCase() === 'brand')
  return brand?.value?.[0]
}

function extractEbayPartNumber(item: Record<string, unknown>, query: string): string | undefined {
  // 1. Check MPN (Manufacturer Part Number) in localizedAspects — most reliable
  const aspects = item.localizedAspects as Array<{ name: string; value: string[] }> | undefined
  if (aspects) {
    const mpnAspect = aspects.find(a =>
      ['mpn', 'manufacturer part number', 'part number', 'part #'].includes(a.name.toLowerCase())
    )
    if (mpnAspect?.value?.[0]) return mpnAspect.value[0].toUpperCase()
  }

  // 2. Try to extract from title using the shared extractor
  const titleStr = String(item.title ?? '')
  return extractPartNumber(titleStr, query)
}

function extractEbayCertifications(item: Record<string, unknown>): string[] {
  const aspects = item.localizedAspects as Array<{ name: string; value: string[] }> | undefined
  if (!aspects) return []
  const certNames = ['certification', 'faa certification', 'pma', 'tsoa', 'stc']
  const certs: string[] = []
  for (const aspect of aspects) {
    if (certNames.some(n => aspect.name.toLowerCase().includes(n))) {
      certs.push(...(aspect.value ?? []))
    }
  }
  return certs
}

function extractEbayBadges(item: Record<string, unknown>): string[] {
  const badges: string[] = []
  if (item.topRatedBuyingExperience as boolean) badges.push('Top Rated')
  if (item.qualifiedPrograms) {
    const programs = item.qualifiedPrograms as string[]
    if (programs.includes('EBAY_PLUS')) badges.push('eBay Plus')
  }
  const seller = item.seller as { feedbackPercentage?: string } | undefined
  if (seller?.feedbackPercentage && parseFloat(seller.feedbackPercentage) >= 99) {
    badges.push('99%+ Feedback')
  }
  return badges
}

export { extractDomain }
