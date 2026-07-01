import { describe, it, expect } from 'vitest'
import { scoreOffer, dedupeOffers, rankOffers } from './ranking'
import type { NormalizedOffer } from './types'

function makeOffer(partial: Partial<NormalizedOffer>): NormalizedOffer {
  return {
    provider: 'serpapi',
    sourceType: 'google_shopping',
    title: 'Some Part',
    productUrl: 'https://example.com/x',
    vendorName: 'Example',
    rawPayload: {},
    ...partial,
  }
}

describe('scoreOffer', () => {
  it('rewards an exact part-number match plus the aviation-trusted bucket', () => {
    const o = makeOffer({
      vendorDomain: 'aircraftspruce.com',
      productUrl: 'https://www.aircraftspruce.com/p',
      vendorName: 'Aircraft Spruce',
      partNumber: 'CH48110-1',
      price: 25,
      imageUrl: 'https://img/x.jpg',
    })
    // +40 (pn) +30 (aviation) +8 (price) +3 (image) = 81
    expect(scoreOffer(o, 'CH48110-1')).toBe(81)
  })

  it('gives a partial (+20) match when the PN only appears in the title', () => {
    const o = makeOffer({
      vendorDomain: 'ebay.com',
      productUrl: 'https://www.ebay.com/itm/1',
      partNumber: 'XYZ',
      title: 'Champion CH48110-1 Oil Filter',
      price: 20,
    })
    // +20 (partial pn in title) +15 (general marketplace) +8 (price) = 43
    expect(scoreOffer(o, 'CH48110')).toBe(43)
  })

  it('adds a bounded rating bonus only when there are enough reviews', () => {
    const withReviews = makeOffer({ vendorDomain: 'ebay.com', productUrl: 'https://ebay.com/i', price: 10, rating: 4.5, ratingCount: 20 })
    const fewReviews = makeOffer({ vendorDomain: 'ebay.com', productUrl: 'https://ebay.com/i', price: 10, rating: 4.5, ratingCount: 3 })
    // reviews: +15 bucket +8 price + min(9,10)=9 → 32 ; few: +15 +8 → 23
    expect(scoreOffer(withReviews, null)).toBe(32)
    expect(scoreOffer(fewReviews, null)).toBe(23)
  })
})

describe('bucketing (via rankOffers)', () => {
  it('classifies an aviation supplier even when the URL is a google.com aggregator', () => {
    const [o] = rankOffers([makeOffer({
      productUrl: 'https://www.google.com/shopping/product/1',
      vendorName: 'Aircraft Spruce',
      price: 30,
    })], null)
    expect(o.sortBucket).toBe('aviation_trusted')
  })

  it('classifies PMA-certified parts as aviation-trusted regardless of domain', () => {
    const [o] = rankOffers([makeOffer({
      productUrl: 'https://randomsite.io/p',
      vendorName: 'Random Shop',
      price: 10,
      certifications: ['PMA'],
    })], null)
    expect(o.sortBucket).toBe('aviation_trusted')
  })

  it('marks a priceless, vendorless offer as uncertain', () => {
    const [o] = rankOffers([makeOffer({ productUrl: 'https://randomsite.io/p', vendorName: '', price: null })], null)
    expect(o.sortBucket).toBe('uncertain')
  })
})

describe('dedupeOffers', () => {
  it('collapses duplicates (same vendor+pn+path) and keeps the one with a price', () => {
    const out = dedupeOffers([
      makeOffer({ vendorName: 'V', partNumber: 'P', productUrl: 'https://x.com/a?ref=1', price: null }),
      makeOffer({ vendorName: 'V', partNumber: 'P', productUrl: 'https://x.com/a?ref=2', price: 10 }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].price).toBe(10)
  })
})

describe('rankOffers', () => {
  it('orders aviation_trusted > general_marketplace > uncertain, then by score', () => {
    const ranked = rankOffers([
      makeOffer({ productUrl: 'https://randomsite.io/u', vendorName: '', price: null }), // uncertain
      makeOffer({ productUrl: 'https://www.ebay.com/itm/2', vendorName: 'seller', price: 20 }), // general
      makeOffer({ vendorDomain: 'aircraftspruce.com', productUrl: 'https://www.aircraftspruce.com/p', vendorName: 'Aircraft Spruce', price: 25 }), // aviation
    ], null)
    expect(ranked.map(o => o.sortBucket)).toEqual(['aviation_trusted', 'general_marketplace', 'uncertain'])
  })
})
