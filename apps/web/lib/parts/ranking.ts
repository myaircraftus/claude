// Ranking + bucketing for normalized offers.
// See spec §6 (ranking & dedup)

import type { NormalizedOffer, RankedOffer, SortBucket } from './types'
import { extractPartNumber } from './normalize'

// Vendor domains considered aviation-trusted.
const AVIATION_TRUSTED_DOMAINS = new Set([
  'aircraftspruce.com',
  'sportys.com',
  'pilotshop.com',
  'aeroperformance.com',
  'acwholesalersinc.com',
  'wentworthaircraft.com',
  'lycoming.com',
  'continentalaerospace.com',
  'tempestplus.com',
  'chtservices.com',
  'champion-aerospace.com',
  'aviall.com',
  'skygeek.com',
  'wicksaircraft.com',
  'cptaviation.com',
  'pacificoil.com',
  'aviation-supply.com',
  'preferredairparts.com',
  'airpowerinc.com',
  'aircraftpartsinc.com',
  'gulfcoastavionics.com',
  'mypilotstore.com',
  'pilotpartsplus.com',
  'aircraft-parts.com',
  'aviationoilstore.com',
])

/**
 * Vendor-name patterns that indicate an aviation supplier even when the URL
 * lives on google.com / shopping aggregators. SerpAPI Google Shopping
 * returns the actual vendor in `source` even though the productUrl is
 * google.com — so name-based detection is essential for bucket accuracy.
 */
const AVIATION_VENDOR_NAME_PATTERNS = [
  /aircraft\s+spruce/i,
  /\bskygeek\b/i,
  /\baviall\b/i,
  /\bwicks\b/i,
  /pilot\s*shop/i,
  /\bsporty'?s\b/i,
  /aero\s*performance/i,
  /lycoming/i,
  /continental\s+aerospace/i,
  /tempest\s*plus/i,
  /champion\s+aerospace/i,
  /\bcpt\s+aviation\b/i,
  /aircraft\s+shop/i,
  /preferred\s+air(craft)?\s+parts/i,
  /air\s*power\s+inc/i,
  /aviation\s+oil\s+store/i,
  /pacific\s+oil/i,
  /gulf\s+coast\s+avionics/i,
  /aviation\s+supply/i,
  /aero\s*specialties/i,
  /\bmypilotstore\b/i,
]

function vendorLooksAviation(vendorName?: string | null): boolean {
  if (!vendorName) return false
  return AVIATION_VENDOR_NAME_PATTERNS.some((re) => re.test(vendorName))
}

// Known general marketplaces (not aviation-specific).
const GENERAL_MARKETPLACES = new Set([
  'ebay.com',
  'amazon.com',
  'walmart.com',
  'google.com',
])

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function bucketFor(offer: NormalizedOffer): SortBucket {
  const domain = (offer.vendorDomain ?? getDomain(offer.productUrl) ?? '').toLowerCase()
  if (AVIATION_TRUSTED_DOMAINS.has(domain)) return 'aviation_trusted'
  // SerpAPI surfaces a `google.com` URL but the actual seller name is in
  // vendorName — fall back to vendor-name pattern matching so suppliers like
  // "Aircraft Spruce" / "SkyGeek" / "Aviall" still get the trusted bucket.
  if (vendorLooksAviation(offer.vendorName)) return 'aviation_trusted'
  if (offer.certifications && offer.certifications.length > 0) return 'aviation_trusted'
  if (GENERAL_MARKETPLACES.has(domain)) return 'general_marketplace'
  if (!offer.price || !offer.vendorName) return 'uncertain'
  return 'general_marketplace'
}

/**
 * Score computation:
 *   base = 0
 *   + part-number exact match (in title/partNumber) = 40
 *   + bucket: aviation_trusted=30, general_marketplace=15, uncertain=0
 *   + has certifications = 10
 *   + has price = 8
 *   + has image = 3
 *   + rating_count >= 10 = min(rating*2, 10)
 *   - higher total price among comparable = modest penalty
 */
export function scoreOffer(offer: NormalizedOffer, queryPartNumber: string | null): number {
  let score = 0
  const bucket = bucketFor(offer)

  // Part number match
  if (queryPartNumber) {
    const pn = (offer.partNumber ?? '').toUpperCase()
    const inTitle = extractPartNumber(offer.title) ?? ''
    if (pn === queryPartNumber || inTitle === queryPartNumber) score += 40
    else if (pn.includes(queryPartNumber) || offer.title.toUpperCase().includes(queryPartNumber)) score += 20
  }

  // Bucket boost
  score += bucket === 'aviation_trusted' ? 30 : bucket === 'general_marketplace' ? 15 : 0

  if (offer.certifications && offer.certifications.length > 0) score += 10
  if (offer.price != null) score += 8
  if (offer.imageUrl) score += 3
  if (offer.rating != null && (offer.ratingCount ?? 0) >= 10) {
    score += Math.min(offer.rating * 2, 10)
  }
  return Number(score.toFixed(4))
}

/** Deduplicate offers across providers using productUrl + vendor_name + part_number. */
export function dedupeOffers(offers: NormalizedOffer[]): NormalizedOffer[] {
  const seen = new Map<string, NormalizedOffer>()
  for (const o of offers) {
    const key = [
      (o.vendorName ?? '').toLowerCase(),
      (o.partNumber ?? '').toLowerCase(),
      (o.productUrl ?? '').split('?')[0].toLowerCase(),
    ].join('|')
    const prev = seen.get(key)
    // Keep the one with more info (price first, then certifications)
    if (!prev) { seen.set(key, o); continue }
    if (prev.price == null && o.price != null) { seen.set(key, o); continue }
    if ((prev.certifications?.length ?? 0) < (o.certifications?.length ?? 0)) seen.set(key, o)
  }
  return Array.from(seen.values())
}

export function rankOffers(
  offers: NormalizedOffer[],
  queryPartNumber: string | null
): RankedOffer[] {
  const deduped = dedupeOffers(offers)
  const ranked: RankedOffer[] = deduped.map(o => ({
    ...o,
    rankScore: scoreOffer(o, queryPartNumber),
    sortBucket: bucketFor(o),
    vendorDomain: o.vendorDomain ?? getDomain(o.productUrl),
  }))
  // Primary sort by bucket then score desc
  const bucketWeight = (b: SortBucket) =>
    b === 'aviation_trusted' ? 2 : b === 'general_marketplace' ? 1 : 0
  ranked.sort((a, b) => {
    const bw = bucketWeight(b.sortBucket) - bucketWeight(a.sortBucket)
    if (bw !== 0) return bw
    return b.rankScore - a.rankScore
  })
  return ranked
}
