// Atlas Parts Network — shared types

export type PartSearchMode = 'exact_part' | 'general' | 'keyword' | 'contextual'

export type PartCondition = 'new' | 'used' | 'overhauled' | 'serviceable' | 'unknown'

export type PartSourceType = 'serp' | 'marketplace' | 'vendor'

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

export type PartSortMode =
  | 'best_match'
  | 'best_price'
  | 'fastest_delivery'
  | 'best_condition'
  | 'top_rated'

// ─── Provider interface ───────────────────────────────────────────────────────

export interface PartSearchInput {
  query: string
  aircraftContext?: {
    aircraftId?: string
    tailNumber?: string
    make?: string
    model?: string
    engineModel?: string
  }
  workOrderId?: string
  filters?: PartSearchFilters
}

export interface PartSearchFilters {
  condition?: PartCondition[]
  vendors?: string[]
  priceMin?: number | null
  priceMax?: number | null
}

export interface ExternalPartOffer {
  id: string
  provider: string
  sourceType: PartSourceType
  query: string
  title: string
  partNumber?: string
  brand?: string
  description?: string
  imageUrl?: string
  productUrl: string
  vendorName: string
  vendorDomain?: string
  vendorLocation?: string
  price?: number
  currency?: string
  shippingPrice?: number
  totalEstimatedPrice?: number
  shippingSpeedLabel?: string
  condition?: PartCondition
  stockLabel?: string
  rating?: number
  ratingCount?: number
  certifications?: string[]
  compatibilityText?: string[]
  badges?: string[]
  rawPayload: unknown
}

export interface PartSearchProvider {
  name: string
  search(input: PartSearchInput): Promise<ExternalPartOffer[]>
}

// ─── Normalized offer (post-ranking) ─────────────────────────────────────────

export interface NormalizedPartOffer extends ExternalPartOffer {
  rankScore: number
  sortBucket: string
}

// ─── API response shapes ──────────────────────────────────────────────────────

export interface PartSearchResponse {
  searchId: string
  query: string
  offers: NormalizedPartOffer[]
  summary: PartSearchSummary
}

export interface PartSearchSummary {
  count: number
  providersUsed: string[]
  providersFailed: string[]
  bestPrice?: number
  fastestDeliveryLabel?: string
}

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface AtlasPartSearch {
  id: string
  organization_id: string
  aircraft_id?: string | null
  work_order_id?: string | null
  maintenance_draft_id?: string | null
  user_id?: string | null
  query_text: string
  normalized_query?: string | null
  search_mode: PartSearchMode
  provider_summary: Record<string, unknown>
  result_count: number
  created_at: string
}

export interface AtlasPartOffer {
  id: string
  part_search_id: string
  organization_id: string
  aircraft_id?: string | null
  work_order_id?: string | null
  provider: string
  source_type: PartSourceType
  external_offer_id?: string | null
  query_text: string
  title: string
  part_number?: string | null
  brand?: string | null
  description?: string | null
  image_url?: string | null
  product_url: string
  vendor_name: string
  vendor_domain?: string | null
  vendor_location?: string | null
  price?: number | null
  currency?: string | null
  shipping_price?: number | null
  total_estimated_price?: number | null
  shipping_speed_label?: string | null
  condition?: PartCondition | null
  stock_label?: string | null
  rating?: number | null
  rating_count?: number | null
  certifications?: string[] | null
  compatibility_text?: string[] | null
  badges?: string[] | null
  rank_score?: number | null
  sort_bucket?: string | null
  raw_payload: Record<string, unknown>
  created_at: string
}

export interface AtlasOrderRecord {
  id: string
  organization_id: string
  aircraft_id?: string | null
  work_order_id?: string | null
  maintenance_draft_id?: string | null
  part_search_id?: string | null
  part_offer_id?: string | null
  user_id?: string | null
  status: PartOrderStatus
  quantity: number
  unit_price?: number | null
  shipping_price?: number | null
  total_price?: number | null
  currency?: string | null
  vendor_name?: string | null
  vendor_url?: string | null
  vendor_order_reference?: string | null
  internal_note?: string | null
  selected_part_number?: string | null
  selected_title?: string | null
  selected_condition?: string | null
  selected_image_url?: string | null
  expected_for_use?: string | null
  ordered_at?: string | null
  shipped_at?: string | null
  delivered_at?: string | null
  installed_at?: string | null
  created_at: string
  updated_at: string
}

export interface AtlasOrderEvent {
  id: string
  organization_id: string
  order_record_id: string
  user_id?: string | null
  event_type: string
  metadata_json: Record<string, unknown>
  created_at: string
}
