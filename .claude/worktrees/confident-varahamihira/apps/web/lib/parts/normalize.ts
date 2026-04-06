import type { ExternalPartOffer, PartCondition, PartSourceType } from './types'

// ─── URL normalization ────────────────────────────────────────────────────────

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    // Remove tracking parameters commonly added by search engines
    const trackingParams = ['gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'ref', 'tag', 'epid']
    for (const p of trackingParams) u.searchParams.delete(p)
    return u.origin + u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '')
  } catch {
    return url
  }
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// ─── Title fingerprint for deduplication ─────────────────────────────────────

export function titleFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 40)
}

// ─── Query classification ─────────────────────────────────────────────────────

const PART_NUMBER_RE = /^[A-Z0-9]{2,}[-\/][A-Z0-9][-A-Z0-9\/]{1,}$/i
const LIKELY_PART_RE = /[A-Z]{1,4}\d{3,}[-\/]?\d*/i

export type QueryType = 'exact_part' | 'likely_part' | 'description' | 'contextual'

export function classifyQuery(query: string): QueryType {
  const q = query.trim()
  if (PART_NUMBER_RE.test(q)) return 'exact_part'
  if (LIKELY_PART_RE.test(q)) return 'likely_part'
  // Contains aviation model/brand references
  const lq = q.toLowerCase()
  if (lq.includes('cessna') || lq.includes('piper') || lq.includes('beech') ||
      lq.includes('lycoming') || lq.includes('continental') || lq.includes('cirrus') ||
      lq.includes('mooney') || lq.includes('diamond')) {
    return 'contextual'
  }
  return 'description'
}

// ─── Condition normalization ──────────────────────────────────────────────────

export function normalizeCondition(raw?: string | null): PartCondition {
  if (!raw) return 'unknown'
  const lower = raw.toLowerCase()
  if (lower.includes('new')) return 'new'
  if (lower.includes('overhaul') || lower.includes('oh')) return 'overhauled'
  if (lower.includes('serviceable') || lower.includes('svc')) return 'serviceable'
  if (lower.includes('used') || lower.includes('core') || lower.includes('as-is')) return 'used'
  return 'unknown'
}

// ─── Price parsing ────────────────────────────────────────────────────────────

export function parsePrice(raw?: string | null): number | undefined {
  if (!raw) return undefined
  const match = raw.replace(/,/g, '').match(/[\d]+\.?\d*/)
  if (!match) return undefined
  const val = parseFloat(match[0])
  return isNaN(val) ? undefined : val
}

// ─── Deduplication ───────────────────────────────────────────────────────────

export function deduplicateOffers(offers: ExternalPartOffer[]): ExternalPartOffer[] {
  const seen = new Map<string, ExternalPartOffer>()

  for (const offer of offers) {
    // Dedup key: normalized URL (only if non-empty), then vendor+part, then vendor+title
    const urlKey = offer.productUrl ? normalizeUrl(offer.productUrl) : ''
    const vendorLower = offer.vendorName.toLowerCase()
    const partLower = (offer.partNumber ?? '').toLowerCase()
    const vendorPartKey = partLower ? `${vendorLower}|pn:${partLower}` : ''
    const vendorTitleKey = `${vendorLower}|t:${titleFingerprint(offer.title)}`

    // Never use an empty string as a dedup key — that would merge all unlinked offers
    const key = urlKey || vendorPartKey || vendorTitleKey

    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, offer)
    } else {
      // Keep the one with more data (image > no image, price > no price)
      const existingScore = (existing.imageUrl ? 2 : 0) + (existing.price != null ? 1 : 0)
      const offerScore = (offer.imageUrl ? 2 : 0) + (offer.price != null ? 1 : 0)
      if (offerScore > existingScore) seen.set(key, offer)
    }
  }

  return Array.from(seen.values())
}

// ─── Source type inference ────────────────────────────────────────────────────

export function inferSourceType(provider: string): PartSourceType {
  if (provider === 'ebay') return 'marketplace'
  if (provider === 'curated') return 'vendor'
  return 'serp'
}
