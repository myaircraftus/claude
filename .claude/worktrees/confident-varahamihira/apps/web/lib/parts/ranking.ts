import type { ExternalPartOffer, NormalizedPartOffer, PartSortMode } from './types'

// ─── Trusted aviation vendor domains ─────────────────────────────────────────

const TRUSTED_DOMAINS: Set<string> = new Set([
  // Specialist aviation parts distributors
  'aircraft-spruce.com',
  'aircraftspruce.com',
  'univair.com',
  'skygeek.com',
  'steinair.com',
  'avex.aero',
  'avparts.aero',
  'aviationparts.com',
  'b-and-d.com',
  // OEM / Type-club / airframe parts
  'csobeechcraft.com',
  'cessnaparts.com',
  'piperparts.com',
  'mooney.com',
  'diamondaircraft.com',
  'cirrusaircraft.com',
  // Engine / accessory OEMs
  'lycoming.com',
  'continentalmotors.aero',
  'safeflightinstrument.com',
  'tempestplus.com',
  'championaerospace.com',
  // Major aviation distributors
  'aviall.com',
  'wencor.com',
  'satair.com',
  'heico.com',
  'ducommun.com',
  // General marketplaces (lower trust but searchable)
  'ebay.com',
  'amazon.com',
])

const AVIATION_KEYWORDS = [
  'aircraft', 'aviation', 'airframe', 'avionics', 'piston', 'propeller',
  'lycoming', 'continental', 'cessna', 'piper', 'beechcraft', 'cirrus',
  'overhauled', 'airworthy', 'faa', 'pma', 'tsoa', 'stc', 'a&p',
  'magneto', 'carburetor', 'alternator', 'vacuum', 'strut',
]

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreOffer(offer: ExternalPartOffer, query: string): number {
  let score = 0
  const titleLower = offer.title.toLowerCase()
  const queryLower = query.toLowerCase()
  const queryTokens = queryLower.split(/\s+/).filter(Boolean)

  // Exact part number match in title (+30)
  if (offer.partNumber && titleLower.includes(offer.partNumber.toLowerCase())) score += 30
  // Query tokens appear in title
  for (const token of queryTokens) {
    if (titleLower.includes(token)) score += 5
  }
  // Has a valid image (+10)
  if (offer.imageUrl) score += 10
  // Has a price (+8)
  if (offer.price != null) score += 8
  // Shipping clarity (+5)
  if (offer.shippingSpeedLabel) score += 5
  // Trusted domain (+15)
  if (offer.vendorDomain && TRUSTED_DOMAINS.has(offer.vendorDomain)) score += 15
  // Aviation keywords in title (+3 each, max 12)
  let kwBonus = 0
  for (const kw of AVIATION_KEYWORDS) {
    if (titleLower.includes(kw)) { kwBonus += 3; if (kwBonus >= 12) break }
  }
  score += kwBonus
  // Rating bonus (up to +10)
  if (offer.rating) score += Math.min(offer.rating * 2, 10)
  // Condition bonus
  if (offer.condition === 'new') score += 8
  else if (offer.condition === 'overhauled') score += 6
  else if (offer.condition === 'serviceable') score += 3

  // Penalties
  if (!offer.productUrl) score -= 50
  if (!offer.vendorName) score -= 10
  // Extreme prices (> $50,000) without context penalized slightly
  if (offer.price && offer.price > 50000) score -= 5

  return Math.max(0, score)
}

function sortBucket(offer: ExternalPartOffer): string {
  if (offer.condition === 'new') return 'new'
  if (offer.condition === 'overhauled') return 'overhauled'
  if (offer.condition === 'serviceable') return 'serviceable'
  if (offer.condition === 'used') return 'used'
  return 'other'
}

// ─── Public ranking function ──────────────────────────────────────────────────

export function rankOffers(
  offers: ExternalPartOffer[],
  query: string,
  sortMode: PartSortMode = 'best_match'
): NormalizedPartOffer[] {
  const scored: NormalizedPartOffer[] = offers.map(offer => ({
    ...offer,
    rankScore: scoreOffer(offer, query),
    sortBucket: sortBucket(offer),
  }))

  switch (sortMode) {
    case 'best_price':
      return scored.sort((a, b) => {
        const ap = a.totalEstimatedPrice ?? a.price ?? Infinity
        const bp = b.totalEstimatedPrice ?? b.price ?? Infinity
        return ap - bp
      })

    case 'fastest_delivery':
      return scored.sort((a, b) => {
        // Offers with shipping speed label first, then by score
        const aHas = a.shippingSpeedLabel ? 0 : 1
        const bHas = b.shippingSpeedLabel ? 0 : 1
        if (aHas !== bHas) return aHas - bHas
        return b.rankScore - a.rankScore
      })

    case 'best_condition': {
      const conditionOrder: Record<string, number> = {
        new: 0, overhauled: 1, serviceable: 2, used: 3, unknown: 4,
      }
      return scored.sort((a, b) => {
        const ao = conditionOrder[a.condition ?? 'unknown'] ?? 4
        const bo = conditionOrder[b.condition ?? 'unknown'] ?? 4
        if (ao !== bo) return ao - bo
        return b.rankScore - a.rankScore
      })
    }

    case 'top_rated':
      return scored.sort((a, b) => {
        const ar = a.rating ?? 0
        const br = b.rating ?? 0
        if (br !== ar) return br - ar
        return b.rankScore - a.rankScore
      })

    default: // best_match
      return scored.sort((a, b) => b.rankScore - a.rankScore)
  }
}
