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

let cachedToken: { value: string; expiresAt: number; env: string } | null = null

async function getEbayToken(env: 'sandbox' | 'production'): Promise<string | null> {
  if (cachedToken && cachedToken.env === env && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value
  }
  const appId = process.env.EBAY_APP_ID
  const certId = process.env.EBAY_CERT_ID
  if (!appId || !certId) {
    console.warn('[ebay] Missing EBAY_APP_ID or EBAY_CERT_ID')
    return null
  }

  const url = EBAY_ENDPOINTS[env].token
  const creds = Buffer.from(`${appId}:${certId}`).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: env === 'production'
      ? 'https://api.ebay.com/oauth/api_scope'
      : 'https://api.ebay.com/oauth/api_scope',
  })

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      console.error(`[ebay] Token request failed (${env}): HTTP ${resp.status} - ${errText.slice(0, 200)}`)
      return null
    }
    const j: any = await resp.json()
    if (!j.access_token) {
      console.error('[ebay] Token response missing access_token:', JSON.stringify(j).slice(0, 200))
      return null
    }
    cachedToken = {
      value: j.access_token,
      expiresAt: Date.now() + (j.expires_in ?? 7200) * 1000,
      env,
    }
    console.log(`[ebay] Got ${env} token, expires in ${j.expires_in}s`)
    return cachedToken.value
  } catch (err: any) {
    console.error(`[ebay] Token fetch error (${env}):`, err?.message)
    return null
  }
}

export async function runEbayProvider(ctx: ProviderContext): Promise<ProviderResult> {
  const started = Date.now()
  const env = (process.env.EBAY_ENV ?? 'production') as 'sandbox' | 'production'
  const token = await getEbayToken(env)
  if (!token) {
    return {
      provider: 'ebay',
      ok: false,
      offers: [],
      error: 'eBay token unavailable (check EBAY_APP_ID/EBAY_CERT_ID)',
      durationMs: Date.now() - started,
    }
  }

  // First try with aviation category filter
  let offers = await fetchEbayOffers(ctx, token, env, EBAY_AVIATION_CATEGORY)

  // If 0 results with aviation category, retry without category filter
  if (offers.length === 0) {
    console.log(`[ebay] 0 results in aviation category for "${ctx.query}", retrying without category filter`)
    offers = await fetchEbayOffers(ctx, token, env, null)
  }

  console.log(`[ebay] Final: ${offers.length} results for "${ctx.query}" (${env})`)
  return { provider: 'ebay', ok: true, offers, durationMs: Date.now() - started }
}

async function fetchEbayOffers(
  ctx: ProviderContext,
  token: string,
  env: 'sandbox' | 'production',
  categoryId: string | null,
): Promise<NormalizedOffer[]> {
  const params = new URLSearchParams({
    q: ctx.query,
    limit: String(Math.min(ctx.maxResults, 50)),
  })
  if (categoryId) {
    params.set('category_ids', categoryId)
  }

  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), ctx.timeoutMs)
    const url = `${EBAY_ENDPOINTS[env].browse}?${params.toString()}`
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type': 'application/json',
      },
      signal: ctrl.signal,
    })
    clearTimeout(timeout)

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '')
      console.error(`[ebay] Browse API HTTP ${resp.status} for "${ctx.query}" (cat=${categoryId}): ${errBody.slice(0, 300)}`)
      // If we get a 500 from sandbox, don't throw - just return empty
      return []
    }

    const json: any = await resp.json()
    const items: any[] = json.itemSummaries ?? []
    console.log(`[ebay] Browse API returned ${items.length} items for "${ctx.query}" (cat=${categoryId})`)
    return items
      .map((r: any) => mapEbayItem(r, ctx.normalizedQuery))
      .filter(Boolean) as NormalizedOffer[]
  } catch (err: any) {
    console.error(`[ebay] Fetch error for "${ctx.query}":`, err?.message)
    return []
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
