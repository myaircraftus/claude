import type { ExternalPartOffer, PartSearchInput, PartSearchProvider } from '../types'

// ─── Curated Aviation Vendor Provider ────────────────────────────────────────
// This provider uses structured search URL templates for selected aviation parts
// vendors. Each vendor entry defines how to build a search URL.
// Additional vendors can be added without changing core search logic.

interface CuratedVendor {
  name: string
  domain: string
  searchUrlTemplate: (query: string) => string
  enabled: boolean
}

const CURATED_VENDORS: CuratedVendor[] = [
  {
    name: 'Aircraft Spruce',
    domain: 'aircraft-spruce.com',
    searchUrlTemplate: (q) => `https://www.aircraft-spruce.com/catalog/search.php?q=${encodeURIComponent(q)}`,
    enabled: true,
  },
  {
    name: 'Univair',
    domain: 'univair.com',
    searchUrlTemplate: (q) => `https://www.univair.com/search?q=${encodeURIComponent(q)}`,
    enabled: true,
  },
  {
    name: 'Skygeek',
    domain: 'skygeek.com',
    searchUrlTemplate: (q) => `https://www.skygeek.com/search?term=${encodeURIComponent(q)}`,
    enabled: true,
  },
  {
    name: 'SteinAir',
    domain: 'steinair.com',
    searchUrlTemplate: (q) => `https://www.steinair.com/search/?q=${encodeURIComponent(q)}`,
    enabled: false, // Enable when direct API becomes available
  },
]

// ─── Curated Provider ─────────────────────────────────────────────────────────
// In Phase 1 this generates search landing page links so users can jump directly
// to pre-populated vendor searches. Results are synthetic but link-valid.

export const curatedProvider: PartSearchProvider = {
  name: 'curated',

  async search(input: PartSearchInput): Promise<ExternalPartOffer[]> {
    const query = input.query.trim()
    const enabledVendors = CURATED_VENDORS.filter(v => v.enabled)

    if (enabledVendors.length === 0) return []

    return enabledVendors.map((vendor): ExternalPartOffer => ({
      id: crypto.randomUUID(),
      provider: 'curated',
      sourceType: 'vendor',
      query,
      title: `Search "${query}" on ${vendor.name}`,
      partNumber: undefined,
      brand: vendor.name,
      description: `View matching parts on ${vendor.name} — a trusted aviation parts supplier.`,
      imageUrl: undefined,
      productUrl: vendor.searchUrlTemplate(query),
      vendorName: vendor.name,
      vendorDomain: vendor.domain,
      price: undefined,
      currency: 'USD',
      shippingPrice: undefined,
      totalEstimatedPrice: undefined,
      shippingSpeedLabel: undefined,
      condition: undefined,
      stockLabel: undefined,
      rating: undefined,
      ratingCount: undefined,
      certifications: [],
      compatibilityText: [],
      badges: ['Trusted Vendor'],
      rawPayload: { vendor: vendor.name, domain: vendor.domain },
    }))
  },
}
