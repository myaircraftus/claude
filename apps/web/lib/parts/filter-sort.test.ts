import { describe, it, expect } from 'vitest'
import {
  parseFilters,
  offerEffectivePrice,
  offerShippingDays,
  applyFilters,
  applySort,
} from './filter-sort'
import type { RankedOffer } from './types'

function makeRanked(partial: Partial<RankedOffer>): RankedOffer {
  return {
    provider: 'serpapi',
    sourceType: 'google_shopping',
    title: 'Part',
    productUrl: 'https://x.com/1',
    vendorName: 'V',
    rawPayload: {},
    rankScore: 0,
    sortBucket: 'general_marketplace',
    ...partial,
  }
}

// ─── parseFilters — request validation ───────────────────────────────────────
describe('parseFilters', () => {
  it('returns null for non-objects / empty / all-invalid input', () => {
    expect(parseFilters(null)).toBeNull()
    expect(parseFilters('nope')).toBeNull()
    expect(parseFilters({})).toBeNull()
    expect(parseFilters({ condition: 'bogus', shipping: 'whenever', sortBy: 'random' })).toBeNull()
  })

  it('whitelists enum fields and drops invalid ones', () => {
    expect(parseFilters({ condition: 'new', shipping: 'next_day', vendorBucket: 'aviation_trusted', sortBy: 'price_asc' }))
      .toEqual({ condition: 'new', shipping: 'next_day', vendorBucket: 'aviation_trusted', sortBy: 'price_asc' })
    expect(parseFilters({ condition: 'used', shipping: 'bogus' })).toEqual({ condition: 'used' })
  })

  it('accepts finite price bounds and rejects NaN/Infinity/non-numbers', () => {
    expect(parseFilters({ priceMin: 10, priceMax: 50 })).toEqual({ priceMin: 10, priceMax: 50 })
    expect(parseFilters({ priceMin: NaN, priceMax: Infinity })).toBeNull()
    expect(parseFilters({ priceMin: '10' })).toBeNull()
  })

  it('uppercases + truncates partNumber and truncates brand to 64 chars', () => {
    expect(parseFilters({ partNumber: 'ch48110-1' })).toEqual({ partNumber: 'CH48110-1' })
    expect(parseFilters({ brand: 'x'.repeat(100) })?.brand).toHaveLength(64)
    expect(parseFilters({ partNumber: 'a'.repeat(100) })?.partNumber).toHaveLength(64)
  })
})

// ─── offerEffectivePrice / offerShippingDays ─────────────────────────────────
describe('offerEffectivePrice', () => {
  it('prefers total estimated price, falls back to price, else null', () => {
    expect(offerEffectivePrice({ price: 100, totalEstimatedPrice: 120 })).toBe(120)
    expect(offerEffectivePrice({ price: 100 })).toBe(100)
    expect(offerEffectivePrice({})).toBeNull()
  })
})

describe('offerShippingDays', () => {
  it('parses common delivery labels to a day count', () => {
    expect(offerShippingDays({ shippingSpeedLabel: 'In Stock' })).toBe(0)
    expect(offerShippingDays({ shippingSpeedLabel: 'Today' })).toBe(0)
    expect(offerShippingDays({ shippingSpeedLabel: 'Next Day' })).toBe(1)
    expect(offerShippingDays({ shippingSpeedLabel: 'overnight' })).toBe(1)
    expect(offerShippingDays({ shippingSpeedLabel: '2-day' })).toBe(2)
    expect(offerShippingDays({ shippingSpeedLabel: 'ships in 5 days' })).toBe(5)
    expect(offerShippingDays({ shippingSpeedLabel: 'about a week' })).toBe(7)
    expect(offerShippingDays({ shippingSpeedLabel: 'this month' })).toBe(30)
    expect(offerShippingDays({ shippingSpeedLabel: '' })).toBeNull()
    expect(offerShippingDays({})).toBeNull()
  })
})

// ─── applyFilters ────────────────────────────────────────────────────────────
describe('applyFilters', () => {
  it('returns all offers when there are no filters', () => {
    const offers = [makeRanked({ title: 'a' }), makeRanked({ title: 'b' })]
    expect(applyFilters(offers, null)).toHaveLength(2)
  })

  it('condition "new" keeps explicit new AND untagged (unknown), drops used', () => {
    const offers = [
      makeRanked({ title: 'new', condition: 'new' }),
      makeRanked({ title: 'unknown', condition: 'unknown' }),
      makeRanked({ title: 'used', condition: 'used' }),
    ]
    expect(applyFilters(offers, { condition: 'new' }).map(o => o.title)).toEqual(['new', 'unknown'])
  })

  it('condition "pma" keeps only PMA-certified (cert or title)', () => {
    const offers = [
      makeRanked({ title: 'cert', certifications: ['PMA approved'] }),
      makeRanked({ title: 'PMA in title' }),
      makeRanked({ title: 'plain new', condition: 'new' }),
    ]
    expect(applyFilters(offers, { condition: 'pma' }).map(o => o.title)).toEqual(['cert', 'PMA in title'])
  })

  it('price bounds use effective price and exclude priceless offers', () => {
    const offers = [
      makeRanked({ title: 'cheap', price: 5 }),
      makeRanked({ title: 'mid', price: 25 }),
      makeRanked({ title: 'pricey', price: 100 }),
      makeRanked({ title: 'noprice', price: null }),
      makeRanked({ title: 'ship-included', price: 100, totalEstimatedPrice: 30 }),
    ]
    expect(applyFilters(offers, { priceMin: 10, priceMax: 50 }).map(o => o.title)).toEqual(['mid', 'ship-included'])
  })

  it('shipping "next_day" keeps <=1 day and drops undated', () => {
    const offers = [
      makeRanked({ title: 'nd', shippingSpeedLabel: 'Next Day' }),
      makeRanked({ title: 'slow', shippingSpeedLabel: 'ships in 3 days' }),
      makeRanked({ title: 'none' }),
    ]
    expect(applyFilters(offers, { shipping: 'next_day' }).map(o => o.title)).toEqual(['nd'])
  })

  it('shipping "in_stock" requires an in-stock label', () => {
    const offers = [
      makeRanked({ title: 'yes', stockLabel: 'In Stock' }),
      makeRanked({ title: 'no', stockLabel: 'Backordered' }),
    ]
    expect(applyFilters(offers, { shipping: 'in_stock' }).map(o => o.title)).toEqual(['yes'])
  })

  it('vendorBucket "aviation_trusted" keeps only that bucket', () => {
    const offers = [
      makeRanked({ title: 'av', sortBucket: 'aviation_trusted' }),
      makeRanked({ title: 'gen', sortBucket: 'general_marketplace' }),
    ]
    expect(applyFilters(offers, { vendorBucket: 'aviation_trusted' }).map(o => o.title)).toEqual(['av'])
  })

  it('brand matches across brand + title (case-insensitive)', () => {
    const offers = [
      makeRanked({ title: 'x', brand: 'Champion' }),
      makeRanked({ title: 'Champion Oil Filter', brand: null }),
      makeRanked({ title: 'Tempest thing', brand: 'Tempest' }),
    ]
    expect(applyFilters(offers, { brand: 'champion' }).map(o => o.title)).toEqual(['x', 'Champion Oil Filter'])
  })

  it('partNumber matches on the pn field or in the title', () => {
    const offers = [
      makeRanked({ title: 'x', partNumber: 'CH48110-1' }),
      makeRanked({ title: 'Champion CH48110-1 Filter' }),
      makeRanked({ title: 'unrelated', partNumber: 'XYZ' }),
    ]
    expect(applyFilters(offers, { partNumber: 'CH48110' }).map(o => o.title)).toEqual(['x', 'Champion CH48110-1 Filter'])
  })
})

// ─── applySort ───────────────────────────────────────────────────────────────
describe('applySort', () => {
  const offers = [
    makeRanked({ title: 'a', price: 30, shippingSpeedLabel: '3 days', rating: 4.0, ratingCount: 100 }),
    makeRanked({ title: 'b', price: 10, shippingSpeedLabel: 'Next Day', rating: 5.0, ratingCount: 2 }),
    makeRanked({ title: 'c', price: null, shippingSpeedLabel: 'In Stock', rating: 4.8, ratingCount: 500 }),
  ]

  it('best_fit preserves rank order (no-op)', () => {
    expect(applySort(offers, 'best_fit').map(o => o.title)).toEqual(['a', 'b', 'c'])
  })
  it('price_asc sorts cheapest first, priceless last', () => {
    expect(applySort(offers, 'price_asc').map(o => o.title)).toEqual(['b', 'a', 'c'])
  })
  it('price_desc sorts most expensive first, priceless last', () => {
    expect(applySort(offers, 'price_desc').map(o => o.title)).toEqual(['a', 'b', 'c'])
  })
  it('fastest sorts by shipping days (in-stock first)', () => {
    expect(applySort(offers, 'fastest').map(o => o.title)).toEqual(['c', 'b', 'a'])
  })
  it('highest_rated weights rating by review volume', () => {
    // c (4.8 * log10(502)) > a (4.0 * log10(102)) > b (5.0 * log10(4))
    expect(applySort(offers, 'highest_rated').map(o => o.title)).toEqual(['c', 'a', 'b'])
  })
})
