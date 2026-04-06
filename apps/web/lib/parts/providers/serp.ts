// SerpAPI Google Shopping provider (https://serpapi.com/google-shopping-api)
// Uses SERPAPI_KEY env var (already in Vercel).

import type { NormalizedOffer, ProviderContext, ProviderResult } from '../types'
import { extractPartNumber } from '../normalize'

const SERP_URL = 'https://serpapi.com/search.json'

export async function runSerpProvider(ctx: ProviderContext): Promise<ProviderResult> {
  const started = Date.now()
  const key = process.env.SERPAPI_KEY || process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY
  if (!key) {
    return { provider: 'serpapi', ok: false, offers: [], error: 'SERPAPI_KEY not set', durationMs: Date.now() - started }
  }

  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: ctx.query,
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
      return { provider: 'serpapi', ok: false, offers: [], error: `HTTP ${resp.status}`, durationMs: Date.now() - started }
    }
    const json: any = await resp.json()
    const shopping: any[] = json.shopping_results ?? []
    const offers: NormalizedOffer[] = shopping.map((r: any) => mapSerpResult(r, ctx.query)).filter(Boolean) as NormalizedOffer[]
    return { provider: 'serpapi', ok: true, offers, durationMs: Date.now() - started }
  } catch (err: any) {
    return {
      provider: 'serpapi',
      ok: false,
      offers: [],
      error: err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'unknown'),
      durationMs: Date.now() - started,
    }
  }
}

function mapSerpResult(r: any, query: string): NormalizedOffer | null {
  if (!r || !r.title || !r.link) return null
  const title = String(r.title)
  const partNumber = extractPartNumber(title) ?? extractPartNumber(query)
  const priceNum = parsePrice(r.price ?? r.extracted_price)
  const vendor = r.source ?? r.seller ?? 'Unknown vendor'
  let vendorDomain: string | null = null
  try { vendorDomain = new URL(r.link).hostname.replace(/^www\./, '').toLowerCase() } catch {}

  return {
    provider: 'serpapi',
    sourceType: 'google_shopping',
    externalOfferId: r.product_id ?? r.position?.toString() ?? null,
    title,
    partNumber,
    brand: null,
    description: r.snippet ?? null,
    imageUrl: r.thumbnail ?? null,
    productUrl: r.link,
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
