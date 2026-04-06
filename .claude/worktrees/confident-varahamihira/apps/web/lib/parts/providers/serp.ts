import { normalizeCondition, parsePrice, extractDomain, classifyQuery } from '../normalize'
import type { ExternalPartOffer, PartSearchInput, PartSearchProvider } from '../types'

const PROVIDER_TIMEOUT_MS = 12_000

// ─── SerpAPI Provider ─────────────────────────────────────────────────────────
// Uses Google Shopping engine as primary; falls back to Google Web organic
// results when no shopping results exist (common for niche aviation parts).

export const serpProvider: PartSearchProvider = {
  name: 'serp',

  async search(input: PartSearchInput): Promise<ExternalPartOffer[]> {
    const apiKey = process.env.SERPAPI_API_KEY
    if (!apiKey) {
      console.warn('[serp] SERPAPI_API_KEY not set — skipping')
      return []
    }

    const queryType = classifyQuery(input.query)
    const isExactPart = queryType === 'exact_part' || queryType === 'likely_part'

    // Build the effective query string
    // For exact part numbers: quote them, do NOT append aircraft context (breaks matching)
    // For descriptive queries: optionally enrich with aircraft make/model
    let effectiveQuery = input.query.trim()
    if (isExactPart) {
      // Wrap in quotes for exact string matching on Shopping
      effectiveQuery = `"${effectiveQuery}"`
    } else if (input.aircraftContext) {
      const { make, model } = input.aircraftContext
      const ctx = [make, model].filter(Boolean).join(' ')
      if (ctx) effectiveQuery = `${effectiveQuery} ${ctx} aviation`
    }

    // Run Shopping search and organic search in parallel
    const [shoppingOffers, organicOffers] = await Promise.all([
      fetchSerpShopping(effectiveQuery, apiKey, input.query),
      // Only run organic for exact part searches (where shopping often returns nothing)
      isExactPart
        ? fetchSerpOrganic(effectiveQuery, apiKey, input.query)
        : Promise.resolve([]),
    ])

    // Return shopping results first; fill with organic if shopping is thin
    const combined = [...shoppingOffers]
    if (shoppingOffers.length < 5) {
      combined.push(...organicOffers)
    }

    return combined
  },
}

// ─── Shopping results ────────────────────────────────────────────────────────

async function fetchSerpShopping(
  effectiveQuery: string,
  apiKey: string,
  originalQuery: string
): Promise<ExternalPartOffer[]> {
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google_shopping')
  url.searchParams.set('q', effectiveQuery)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('num', '20')
  url.searchParams.set('hl', 'en')
  url.searchParams.set('gl', 'us')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)

  try {
    const res = await fetch(url.toString(), { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[serp/shopping] non-OK response', res.status, body.slice(0, 200))
      return []
    }

    const json = await res.json() as {
      shopping_results?: unknown[]
      search_metadata?: { status?: string }
    }

    if (json.search_metadata?.status === 'Error') {
      console.error('[serp/shopping] API returned Error status')
      return []
    }

    const results = (json.shopping_results ?? []) as Record<string, unknown>[]

    return results.map((item): ExternalPartOffer => {
      const productUrl = sanitizeUrl(String(item.link ?? item.product_link ?? ''))
      const price = parsePrice(item.price as string | undefined)
      const shippingPrice = parsePrice(item.shipping as string | undefined)
      const totalEstimatedPrice =
        price != null
          ? price + (shippingPrice ?? 0)
          : undefined

      return {
        id: crypto.randomUUID(),
        provider: 'serp',
        sourceType: 'serp',
        query: originalQuery,
        title: String(item.title ?? 'Unknown Part'),
        partNumber: extractPartNumber(String(item.title ?? ''), originalQuery),
        brand: item.source ? String(item.source) : undefined,
        description: item.snippet ? String(item.snippet) : undefined,
        imageUrl: item.thumbnail ? String(item.thumbnail) : undefined,
        productUrl,
        vendorName: item.source ? String(item.source) : extractDomain(productUrl),
        vendorDomain: extractDomain(productUrl) || undefined,
        price,
        currency: 'USD',
        shippingPrice,
        totalEstimatedPrice,
        shippingSpeedLabel: item.delivery ? String(item.delivery) : undefined,
        condition: normalizeCondition(item.condition as string | undefined),
        stockLabel: undefined,
        rating: item.rating ? Number(item.rating) : undefined,
        ratingCount: item.reviews ? Number(item.reviews) : undefined,
        certifications: [],
        compatibilityText: extractCompatibility(item),
        badges: extractBadges(item),
        rawPayload: item,
      }
    })
  } catch (err) {
    clearTimeout(timeout)
    if ((err as Error).name === 'AbortError') {
      console.error('[serp/shopping] request timed out after', PROVIDER_TIMEOUT_MS, 'ms')
    } else {
      console.error('[serp/shopping] fetch error', err)
    }
    return []
  }
}

// ─── Organic / web results fallback ──────────────────────────────────────────
// Used for exact part number searches where Shopping often has no results.
// Returns product-page-looking organic hits filtered for relevance.

async function fetchSerpOrganic(
  effectiveQuery: string,
  apiKey: string,
  originalQuery: string
): Promise<ExternalPartOffer[]> {
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', `${effectiveQuery} buy aviation part`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('num', '10')
  url.searchParams.set('hl', 'en')
  url.searchParams.set('gl', 'us')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)

  try {
    const res = await fetch(url.toString(), { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) return []

    const json = await res.json() as { organic_results?: unknown[] }
    const results = (json.organic_results ?? []) as Record<string, unknown>[]

    // Filter to results that look like product pages (have price snippet or aviation terms)
    const filtered = results.filter(item => {
      const snippet = String(item.snippet ?? '').toLowerCase()
      const title = String(item.title ?? '').toLowerCase()
      return (
        snippet.includes('$') ||
        snippet.includes('price') ||
        snippet.includes('buy') ||
        snippet.includes('part') ||
        title.includes('part') ||
        isAviationVendorUrl(String(item.link ?? ''))
      )
    })

    return filtered.map((item): ExternalPartOffer => {
      const productUrl = sanitizeUrl(String(item.link ?? ''))
      return {
        id: crypto.randomUUID(),
        provider: 'serp',
        sourceType: 'serp',
        query: originalQuery,
        title: String(item.title ?? 'Unknown Part'),
        partNumber: extractPartNumber(String(item.title ?? ''), originalQuery),
        brand: undefined,
        description: String(item.snippet ?? ''),
        imageUrl: undefined,
        productUrl,
        vendorName: extractDomain(productUrl) || 'Web Result',
        vendorDomain: extractDomain(productUrl) || undefined,
        price: extractPriceFromSnippet(String(item.snippet ?? '')),
        currency: 'USD',
        shippingPrice: undefined,
        totalEstimatedPrice: extractPriceFromSnippet(String(item.snippet ?? '')),
        shippingSpeedLabel: undefined,
        condition: undefined,
        stockLabel: undefined,
        rating: undefined,
        ratingCount: undefined,
        certifications: [],
        compatibilityText: [],
        badges: ['Web Result'],
        rawPayload: item,
      }
    })
  } catch (err) {
    clearTimeout(timeout)
    console.error('[serp/organic] fetch error', (err as Error).message)
    return []
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Aviation part number patterns:
// CH48110-1, 641510-1, SL74224-8, LW-14272, 35-815710-3, AN960-10, MS21042-3
const PART_NUMBER_RE = /\b([A-Z]{0,4}\d{3,}[-\/][A-Z0-9][-A-Z0-9]*|[A-Z]{1,4}-\d{3,}[-A-Z0-9]*)\b/gi

export function extractPartNumber(title: string, query?: string): string | undefined {
  // If query itself looks like a part number, use it directly
  if (query) {
    const cleanQuery = query.trim().replace(/^"|"$/g, '')
    if (/^[A-Z0-9]{2,}[-\/][A-Z0-9][-A-Z0-9\/]*$/i.test(cleanQuery)) {
      return cleanQuery.toUpperCase()
    }
  }
  const match = title.match(PART_NUMBER_RE)
  return match ? match[0].toUpperCase() : undefined
}

function extractBadges(item: Record<string, unknown>): string[] {
  const badges: string[] = []
  if (item.badge) badges.push(String(item.badge))
  if (item.tag) badges.push(String(item.tag))
  if (item.extensions) {
    const exts = item.extensions as string[]
    badges.push(...exts.slice(0, 2))
  }
  return badges.filter(Boolean)
}

function extractCompatibility(item: Record<string, unknown>): string[] {
  const snippet = String(item.snippet ?? '')
  if (!snippet) return []
  // Look for "compatible with", "fits", "for" followed by aircraft models
  const compatMatch = snippet.match(/(?:compatible with|fits?|for)\s+([^.]{5,60})/i)
  return compatMatch ? [compatMatch[1].trim()] : []
}

function extractPriceFromSnippet(snippet: string): number | undefined {
  const match = snippet.match(/\$\s*([\d,]+\.?\d*)/)
  if (!match) return undefined
  const val = parseFloat(match[1].replace(/,/g, ''))
  return isNaN(val) ? undefined : val
}

function sanitizeUrl(url: string): string {
  if (!url) return url
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return u.toString()
  } catch {
    return ''
  }
}

const AVIATION_VENDOR_PATTERNS = [
  'aircraft-spruce', 'aircraftspruce', 'aviall', 'wencor', 'satair',
  'univair', 'skygeek', 'steinair', 'csobeechcraft', 'cessnaparts',
  'piperparts', 'b-and-d', 'avparts', 'avex', 'safeflightinstrument',
]

function isAviationVendorUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return AVIATION_VENDOR_PATTERNS.some(p => lower.includes(p))
}
