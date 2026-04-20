// Shared types for the parts search & ordering system (Atlas Network).
// See: mark downs/17. myaircraft_atlas_parts_network_master_prompt.md

export type SearchMode = 'exact_part' | 'general' | 'keyword' | 'contextual'

export type OfferCondition =
  | 'new'
  | 'overhauled'
  | 'serviceable'
  | 'used'
  | 'as-removed'
  | 'refurbished'
  | 'unknown'

export type SortBucket = 'aviation_trusted' | 'general_marketplace' | 'uncertain'

export type ProviderId = 'serpapi' | 'ebay' | 'curated'

/** A normalized offer from any provider, ready to rank + persist. */
export interface NormalizedOffer {
  provider: ProviderId
  sourceType: string
  externalOfferId?: string | null
  title: string
  partNumber?: string | null
  brand?: string | null
  description?: string | null
  imageUrl?: string | null
  productUrl: string
  vendorName: string
  vendorDomain?: string | null
  vendorLocation?: string | null
  price?: number | null
  currency?: string | null
  shippingPrice?: number | null
  totalEstimatedPrice?: number | null
  shippingSpeedLabel?: string | null
  condition?: OfferCondition
  stockLabel?: string | null
  rating?: number | null
  ratingCount?: number | null
  certifications?: string[]
  compatibilityText?: string[]
  badges?: string[]
  rawPayload: Record<string, unknown>
}

/** An offer plus its final rank score + bucket, returned to the client. */
export interface RankedOffer extends NormalizedOffer {
  rankScore: number
  sortBucket: SortBucket
  id?: string // set after persist
}

export interface ProviderContext {
  query: string
  normalizedQuery: string
  searchMode: SearchMode
  aircraftMakeModel?: string | null
  aircraftYear?: number | null
  engineModel?: string | null
  maxResults: number
  timeoutMs: number
}

export interface ProviderResult {
  provider: ProviderId
  ok: boolean
  offers: NormalizedOffer[]
  error?: string
  durationMs: number
}

export interface AIResolutionInfo {
  partNumbers: string[]
  searchQuery: string
  description: string
  system: string
  alternates: string[]
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

export interface LibraryMatch {
  id: string
  partNumber: string
  title: string
  category?: string | null
  preferredVendor?: string | null
  vendorUrl?: string | null
  imageUrl?: string | null
  condition?: string | null
  basePrice?: number | null
  sellPrice?: number | null
  currency?: string | null
  usageCount: number
  lastOrderedAt?: string | null
  matchReason: 'part_number' | 'title' | 'description' | 'vendor' | 'recent'
}

export interface SearchResponse {
  searchId: string
  query: string
  searchMode: SearchMode
  offers: RankedOffer[]
  providerSummary: Record<ProviderId, { ok: boolean; count: number; error?: string; durationMs: number }>
  resultCount: number
  /** AI-resolved part info (only present when aircraft context was provided) */
  aiResolution?: AIResolutionInfo | null
  /** Matching parts already saved to the org library */
  libraryMatches?: LibraryMatch[]
}

export type PartOrderStatus =
  | 'draft'
  | 'clicked_out'
  | 'marked_ordered'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'received'
  | 'installed'
  | 'cancelled'

export interface PartOrderRecord {
  id: string
  organization_id: string
  aircraft_id: string | null
  work_order_id: string | null
  part_search_id: string | null
  part_offer_id: string | null
  user_id: string | null
  status: PartOrderStatus
  quantity: number
  unit_price: number | null
  shipping_price: number | null
  total_price: number | null
  currency: string | null
  vendor_name: string | null
  vendor_url: string | null
  vendor_order_reference: string | null
  internal_note: string | null
  selected_part_number: string | null
  selected_title: string | null
  selected_condition: string | null
  selected_image_url: string | null
  expected_for_use: string | null
  ordered_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  installed_at: string | null
  created_at: string
  updated_at: string
}
