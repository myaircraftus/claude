// SerpAPI Google Shopping provider (https://serpapi.com/google-shopping-api)
// Uses SERPAPI_KEY env var (already in Vercel).

import type { NormalizedOffer, ProviderContext, ProviderResult } from '../types'
import { extractPartNumber } from '../normalize'

const SERP_URL = 'https://serpapi.com/search.json'

export async function runSerpProvider(ctx: ProviderContext): Promise<ProviderResult> {
  const started = Date.now()
  const key = process.env.SERPAPI_KEY || process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY
  if (!key) {
    console.warn('[serp] No API key found (checked SERPAPI_KEY, SERP_API_KEY, SERPAPI_API_KEY)')
    return { provider: 'serpapi', ok: false, offers: [], error: 'SERPAPI_KEY not set', durationMs: Date.now() - started }
  }

  // First try with the full query (may include aircraft context)
  let offers = await fetchSerpOffers(ctx.query, key, ctx, started)

  // If zero results and we have a multi-word query, retry with just the core query
  // (the full query may have been too specific or had unhelpful context appended)
  if (offers.length === 0 && ctx.query !== ctx.normalizedQuery) {
    console.log(`[serp] 0 results for "${ctx.query}", retrying with "${ctx.normalizedQuery}"`)
    offers = await fetchSerpOffers(ctx.normalizedQuery, key, ctx, started)
  }

  // If still zero results with keyword mode, try with "aviation" appended
  if (offers.length === 0 && ctx.searchMode === 'keyword') {
    const aviationQuery = `${ctx.normalizedQuery} aviation`
    console.log(`[serp] 0 results still, retrying with "${aviationQuery}"`)
    offers = await fetchSerpOffers(aviationQuery, key, ctx, started)
  }

  return { provider: 'serpapi', ok: true, offers, durationMs: Date.now() - started }
}

async function fetchSerpOffers(
  query: string,
  key: string,
  ctx: ProviderContext,
  started: number,
): Promise<NormalizedOffer[]> {
  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: query,
    api_key: key,
    num: String(Math.min(ctx.maxResults, 40)),
    hl: 'en',
    gl: 'us',
  })

  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), ctx.timeoutMs)
    const resp = await fetch(`${SERP_URL}?${params.toString()}`, { signal: ctrl.signal })
    clearTimeout(timeout)

    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      console.error(`[serp] HTTP ${resp.status} for q="${query}": ${body.slice(0, 200)}`)
      return []
    }

    const json: any = await resp.json()

    // SerpAPI returns shopping results in 'shopping_results' key
    const shopping: any[] = json.shopping_results ?? []

    // Also check inline_shopping_results (sometimes results come here instead)
    const inline: any[] = json.inline_shopping_results ?? []

    console.log(`[serp] q="${query}" → ${shopping.length} shopping + ${inline.length} inline results`)

    const allResults = [...shopping, ...inline]
    return allResults
      .map((r: any) => mapSerpResult(r, ctx.normalizedQuery))
      .filter(Boolean) as NormalizedOffer[]
  } catch (err: any) {
    console.error(`[serp] Fetch error for q="${query}":`, err?.message)
    return []
  }
}

function mapSerpResult(r: any, query: string): NormalizedOffer | null {
  if (!r || !r.title) return null

  // Some results have 'link', some have 'product_link', some have 'url'
  const productUrl = r.link || r.product_link || r.url
  if (!productUrl) return null

  const title = String(r.title)
  const partNumber = extractPartNumber(title) ?? extractPartNumber(query)
  const priceNum = parsePrice(r.price ?? r.extracted_price)
  const vendor = r.source ?? r.seller ?? r.merchant?.name ?? 'Unknown vendor'
  let vendorDomain: string | null = null
  try { vendorDomain = new URL(productUrl).hostname.replace(/^www\./, '').toLowerCase() } catch {}

  return {
    provider: 'serpapi',
    sourceType: 'google_shopping',
    externalOfferId: r.product_id ?? r.position?.toString() ?? null,
    title,
    partNumber,
    brand: null,
    description: r.snippet ?? null,
    imageUrl: r.thumbnail ?? null,
    productUrl,
    vendorName: vendor,
    vendorDomain,
    vendorLocation: null,
    price: priceNum,
    currency: priceNum != null ? 'USD' : null,
    shippingPrice: null,
    totalEstimatedPrice: priceNum,
    shippingSpeedLabel: r.delivery ?? null,
    condition: inferCondition(title),
    stockLabel: null,
    rating: typeof r.rating === 'number' ? r.rating : null,
    ratingCount: typeof r.reviews === 'number' ? r.reviews : null,
    certifications: [],
    compatibilityText: [],
    badges: [],
    rawPayload: r,
  }
}

function parsePrice(raw: unknown): number | null {
  if (typeof raw === 'number') return raw
  if (typeof raw !== 'string') return null
  const m = raw.match(/[\d,]+\.?\d*/)
  if (!m) return null
  const n = Number(m[0].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function inferCondition(title: string): NormalizedOffer['condition'] {
  const t = title.toLowerCase()
  if (/\bnew\b/.test(t)) return 'new'
  if (/overhauled|\bovhd\b/.test(t)) return 'overhauled'
  if (/serviceable|\bs\/v\b/.test(t)) return 'serviceable'
  if (/refurbished/.test(t)) return 'refurbished'
  if (/\bused\b/.test(t)) return 'used'
  if (/as[-\s]?removed/.test(t)) return 'as-removed'
  return 'unknown'
}
