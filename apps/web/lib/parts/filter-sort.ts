// Pure filter / sort / filter-validation logic for parts search. Extracted from
// the search orchestrator (search.ts) and the POST route so it carries no
// provider / supabase / AI dependencies and can be unit-tested directly.
// See filter-sort.test.ts.

import type {
  RankedOffer,
  PartsSearchFilters,
  ConditionFilter,
  ShippingFilter,
  VendorBucketFilter,
  SortMode,
} from './types'

// ─── Request-filter validation (POST /api/parts/search body → filters) ──────
const VALID_CONDITION: ConditionFilter[] = ['any', 'new', 'pma', 'overhauled', 'serviceable', 'used']
const VALID_SHIPPING: ShippingFilter[] = ['any', 'in_stock', 'next_day', 'two_day', 'this_week']
const VALID_VENDOR_BUCKET: VendorBucketFilter[] = ['any', 'aviation_trusted']
const VALID_SORT: SortMode[] = ['best_fit', 'price_asc', 'price_desc', 'fastest', 'highest_rated']

/** Whitelist + normalize a raw filters object. Returns null when nothing usable. */
export function parseFilters(raw: any): PartsSearchFilters | null {
  if (!raw || typeof raw !== 'object') return null
  const out: PartsSearchFilters = {}
  if (typeof raw.condition === 'string' && (VALID_CONDITION as string[]).includes(raw.condition)) {
    out.condition = raw.condition as ConditionFilter
  }
  if (typeof raw.priceMin === 'number' && Number.isFinite(raw.priceMin)) out.priceMin = raw.priceMin
  if (typeof raw.priceMax === 'number' && Number.isFinite(raw.priceMax)) out.priceMax = raw.priceMax
  if (typeof raw.shipping === 'string' && (VALID_SHIPPING as string[]).includes(raw.shipping)) {
    out.shipping = raw.shipping as ShippingFilter
  }
  if (typeof raw.vendorBucket === 'string' && (VALID_VENDOR_BUCKET as string[]).includes(raw.vendorBucket)) {
    out.vendorBucket = raw.vendorBucket as VendorBucketFilter
  }
  if (typeof raw.brand === 'string') out.brand = raw.brand.slice(0, 64)
  if (typeof raw.partNumber === 'string') out.partNumber = raw.partNumber.slice(0, 64).toUpperCase()
  if (typeof raw.sortBy === 'string' && (VALID_SORT as string[]).includes(raw.sortBy)) {
    out.sortBy = raw.sortBy as SortMode
  }
  return Object.keys(out).length > 0 ? out : null
}

// ─── Post-ranking filters + sort (applied after rankOffers, before persist) ──

export function offerEffectivePrice(o: { price?: number | null; totalEstimatedPrice?: number | null }) {
  return typeof o.totalEstimatedPrice === 'number'
    ? o.totalEstimatedPrice
    : typeof o.price === 'number'
      ? o.price
      : null
}

export function offerShippingDays(o: { shippingSpeedLabel?: string | null }): number | null {
  const label = (o.shippingSpeedLabel ?? '').toLowerCase()
  if (!label) return null
  if (/in[-\s]?stock|today|same[-\s]?day/.test(label)) return 0
  if (/next[-\s]?day|1[-\s]?day|overnight|express/.test(label)) return 1
  if (/2[-\s]?day|two[-\s]?day/.test(label)) return 2
  if (/3[-\s]?day|3 days/.test(label)) return 3
  if (/(\d+)[-\s]?(?:to[-\s]?\d+\s+)?days?/.exec(label)) {
    const m = /(\d+)[-\s]?days?/.exec(label)
    if (m) return Number.parseInt(m[1], 10)
  }
  if (/week/.test(label)) return 7
  if (/month/.test(label)) return 30
  return null
}

export function applyFilters(
  offers: RankedOffer[],
  filters: PartsSearchFilters | null | undefined
): RankedOffer[] {
  if (!filters) return offers

  const cond = filters.condition ?? 'any'
  const minPrice = typeof filters.priceMin === 'number' ? filters.priceMin : null
  const maxPrice = typeof filters.priceMax === 'number' ? filters.priceMax : null
  const ship = filters.shipping ?? 'any'
  const vendorBucket = filters.vendorBucket ?? 'any'
  const brandFilter = (filters.brand ?? '').trim().toLowerCase()
  const pnFilter = (filters.partNumber ?? '').trim().toUpperCase()

  return offers.filter((o) => {
    // Condition (PMA = "new" w/ certifications mentioning PMA, otherwise any new)
    // Treat 'unknown' specially: most Google Shopping listings don't tag
    // condition, but they're typically new. So `new` filter accepts both
    // explicit 'new' AND 'unknown'. Used/refurbished/etc. are excluded
    // even when filter is 'new'.
    if (cond !== 'any') {
      const oc = (o.condition ?? 'unknown').toLowerCase()
      const certs = (o.certifications ?? []).join(' ').toLowerCase()
      if (cond === 'pma') {
        if (!(certs.includes('pma') || /pma/i.test(o.title))) return false
      } else if (cond === 'new') {
        if (oc !== 'new' && oc !== 'unknown') return false
      } else if (oc !== cond) {
        return false
      }
    }

    // Price
    const eff = offerEffectivePrice(o)
    if (minPrice != null && (eff == null || eff < minPrice)) return false
    if (maxPrice != null && (eff == null || eff > maxPrice)) return false

    // Shipping
    if (ship !== 'any') {
      if (ship === 'in_stock') {
        const stock = (o.stockLabel ?? '').toLowerCase()
        if (!stock.includes('in stock')) return false
      } else {
        const days = offerShippingDays(o)
        if (days == null) return false
        if (ship === 'next_day' && days > 1) return false
        if (ship === 'two_day' && days > 2) return false
        if (ship === 'this_week' && days > 7) return false
      }
    }

    // Vendor bucket
    if (vendorBucket === 'aviation_trusted' && o.sortBucket !== 'aviation_trusted') {
      return false
    }

    // Brand
    if (brandFilter) {
      const haystack = `${o.brand ?? ''} ${o.title}`.toLowerCase()
      if (!haystack.includes(brandFilter)) return false
    }

    // Strict part-number filter (used when AI resolution is high-confidence)
    if (pnFilter) {
      const pn = (o.partNumber ?? '').toUpperCase()
      const inTitle = o.title.toUpperCase()
      if (!pn.includes(pnFilter) && !inTitle.includes(pnFilter)) return false
    }

    return true
  })
}

export function applySort(offers: RankedOffer[], mode: SortMode): RankedOffer[] {
  const sorted = [...offers]
  switch (mode) {
    case 'price_asc':
      sorted.sort((a, b) => {
        const ap = offerEffectivePrice(a) ?? Infinity
        const bp = offerEffectivePrice(b) ?? Infinity
        return ap - bp
      })
      break
    case 'price_desc':
      sorted.sort((a, b) => {
        const ap = offerEffectivePrice(a) ?? -Infinity
        const bp = offerEffectivePrice(b) ?? -Infinity
        return bp - ap
      })
      break
    case 'fastest':
      sorted.sort((a, b) => {
        const ad = offerShippingDays(a) ?? 999
        const bd = offerShippingDays(b) ?? 999
        return ad - bd
      })
      break
    case 'highest_rated':
      sorted.sort((a, b) => {
        const ar = (a.rating ?? 0) * Math.log10(2 + (a.ratingCount ?? 0))
        const br = (b.rating ?? 0) * Math.log10(2 + (b.ratingCount ?? 0))
        return br - ar
      })
      break
    case 'best_fit':
    default:
      // Already in rank order from rankOffers. No-op.
      break
  }
  return sorted
}
