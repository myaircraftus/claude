// eBay Browse API provider
// Supports sandbox + production via EBAY_ENV env var.
// Uses OAuth client_credentials flow with EBAY_APP_ID + EBAY_CERT_ID.

import type { NormalizedOffer, ProviderContext, ProviderResult } from '../types'
import { extractPartNumber } from '../normalize'

const EBAY_ENDPOINTS = {
  sandbox: {
    token: 'https://api.sandbox.ebay.com/identity/v1/oauth2/token',
    browse: 'https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search',
  },
  production: {
    token: 'https://api.ebay.com/identity/v1/oauth2/token',
    browse: 'https://api.ebay.com/buy/browse/v1/item_summary/search',
  },
}

// Aviation categories on eBay: Business & Industrial > Aviation Parts & Accessories (26436)
const EBAY_AVIATION_CATEGORY = '26436'

let cachedToken: { value: string; expiresAt: number } | null = null

async function getEbayToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value
  const appId = process.env.EBAY_APP_ID
  const certId = process.env.EBAY_CERT_ID
  if (!appId || !certId) return null
  const env = (process.env.EBAY_ENV ?? 'sandbox') as 'sandbox' | 'production'
  const url = EBAY_ENDPOINTS[env].token
  const creds = Buffer.from(`${appId}:${certId}`).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'https://api.ebay.com/oauth/api_scope',
  })
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!resp.ok) return null
  const j: any = await resp.json()
  if (!j.access_token) return null
  cachedToken = {
    value: j.access_token,
    expiresAt: Date.now() + (j.expires_in ?? 7200) * 1000,
  }
  return cachedToken.value
}

export async function runEbayProvider(ctx: ProviderContext): Promise<ProviderResult> {
  const started = Date.now()
  const env = (process.env.EBAY_ENV ?? 'sandbox') as 'sandbox' | 'production'
  const token = await getEbayToken()
  if (!token) {
    return { provider: 'ebay', ok: false, offers: [], error: 'eBay token unavailable (check EBAY_APP_ID/EBAY_CERT_ID)', durationMs: Date.now() - started }
  }

  const params = new URLSearchParams({
    q: ctx.query,
    limit: String(Math.min(ctx.maxResults, 50)),
    category_ids: EBAY_AVIATION_CATEGORY,
  })

  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), ctx.timeoutMs)
    const resp = await fetch(`${EBAY_ENDPOINTS[env].browse}?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type': 'application/json',
      },
      signal: ctrl.signal,
    })
    clearTimeout(timeout)
    if (!resp.ok) {
      return { provider: 'ebay', ok: false, offers: [], error: `HTTP ${resp.status}`, durationMs: Date.now() - started }
    }
    const json: any = await resp.json()
    const items: any[] = json.itemSummaries ?? []
    const offers: NormalizedOffer[] = items.map((r: any) => mapEbayItem(r, ctx.query)).filter(Boolean) as NormalizedOffer[]
    return { provider: 'ebay', ok: true, offers, durationMs: Date.now() - started }
  } catch (err: any) {
    return {
      provider: 'ebay',
      ok: false,
      offers: [],
      error: err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'unknown'),
      durationMs: Date.now() - started,
    }
  }
}

function mapEbayItem(item: any, query: string): NormalizedOffer | null {
  if (!item || !item.title || !item.itemWebUrl) return null
  const priceVal = item.price?.value ? Number(item.price.value) : null
  const shipRaw = item.shippingOptions?.[0]?.shippingCost?.value
  const shipping = shipRaw ? Number(shipRaw) : null
  const partNumber = extractPartNumber(item.title) ?? extractPartNumber(query)
  const condition = normalizeEbayCondition(item.condition)
  const rawTitle: string = item.title
  let vendorName = item.seller?.username ?? 'eBay seller'
  let vendorDomain: string | null = null
  try { vendorDomain = new URL(item.itemWebUrl).hostname.replace(/^www\./, '').toLowerCase() } catch {}

  return {
    provider: 'ebay',
    sourceType: 'ebay_browse',
    externalOfferId: item.itemId ?? null,
    title: rawTitle,
    partNumber,
    brand: item.brand ?? null,
    description: item.shortDescription ?? null,
    imageUrl: item.image?.imageUrl ?? item.thumbnailImages?.[0]?.imageUrl ?? null,
    productUrl: item.itemWebUrl,
    vendorName,
    vendorDomain,
    vendorLocation: item.itemLocation?.country ?? null,
    price: priceVal,
    currency: item.price?.currency ?? 'USD',
    shippingPrice: shipping,
    totalEstimatedPrice: priceVal != null ? priceVal + (shipping ?? 0) : null,
    shippingSpeedLabel: item.shippingOptions?.[0]?.maxEstimatedDeliveryDate ? 'est. ship' : null,
    condition,
    stockLabel: item.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus ?? null,
    rating: typeof item.seller?.feedbackPercentage === 'string'
      ? Number(item.seller.feedbackPercentage) / 20 // convert 0-100 to 0-5
      : null,
    ratingCount: typeof item.seller?.feedbackScore === 'number' ? item.seller.feedbackScore : null,
    certifications: [],
    compatibilityText: [],
    badges: ['ebay'],
    rawPayload: item,
  }
}

function normalizeEbayCondition(c: string | undefined): NormalizedOffer['condition'] {
  if (!c) return 'unknown'
  const lc = c.toLowerCase()
  if (lc.includes('new')) return 'new'
  if (lc.includes('refurbished')) return 'refurbished'
  if (lc.includes('overhaul')) return 'overhauled'
  if (lc.includes('serviceable')) return 'serviceable'
  if (lc.includes('used') || lc.includes('pre-owned')) return 'used'
  if (lc.includes('for parts')) return 'as-removed'
  return 'unknown'
}
