import type { Aircraft, Document } from '@/types'

export type MarketplaceMode = 'parts' | 'manuals'

export type MarketplacePrimaryTab =
  | 'browse'
  | 'seller-dashboard'
  | 'my-listings'
  | 'seller-plans'
  | 'moderation'

export type SellerPlanId = 'starter' | 'pro'
export type SellerPlanStatus = 'active' | 'paused' | 'canceled' | 'trial'
export type SellerBillingCycle = 'monthly' | 'annual'

export type MarketplaceListingKind = 'part' | 'document'

export type PartListingStatus = 'draft' | 'available' | 'pending' | 'sold' | 'archived'

export type PartCondition =
  | 'new'
  | 'new_surplus'
  | 'overhauled'
  | 'serviceable'
  | 'as_removed'
  | 'used'
  | 'for_repair'

export type DocumentMarketplaceType =
  | 'manual'
  | 'maintenance_manual'
  | 'service_manual'
  | 'parts_catalog'
  | 'ipc'
  | 'wiring_manual'
  | 'structural_repair_manual'
  | 'overhaul_manual'
  | 'component_maintenance_manual'
  | 'document_other'

export type DocumentAccessChoice = 'download' | 'download_and_inject' | 'inject'
export type InjectionTargetScope = 'current_aircraft' | 'aircraft' | 'workspace'
export type ContactMethod = 'call' | 'text' | 'email'

export interface SellerPlanDefinition {
  id: SellerPlanId
  name: string
  monthlyPrice: number
  listingLimit: number | null
  supportsVideo: boolean
  supportsPriority: boolean
  supportsAdvancedAnalytics: boolean
  features: string[]
}

export interface SellerPlanAccount {
  organizationId: string
  sellerPlan: SellerPlanId
  status: SellerPlanStatus
  billingCycle: SellerBillingCycle
  activatedAt?: string | null
  activeListingsCount: number
  listingLimit: number | null
}

export interface ListingUsageSummary {
  planId: SellerPlanId
  activeCount: number
  draftCount: number
  soldCount: number
  pendingCount: number
  archivedCount: number
  listingLimit: number | null
  remainingCount: number | null
}

export interface PartListingMedia {
  id: string
  type: 'image' | 'video'
  url: string
  alt: string
  storagePath?: string
  mimeType?: string
  fileName?: string
  sizeBytes?: number
}

export interface PartContactMetrics {
  call: number
  text: number
  email: number
  total: number
}

export interface MarketplacePartListing {
  id: string
  listingKind: 'part'
  title: string
  partNumber: string
  alternatePartNumber?: string | null
  manufacturer: string
  category: string
  subcategory?: string | null
  condition: PartCondition
  priceCents: number
  quantity: number
  location: string
  serialNumber?: string | null
  fitsApplicability?: string | null
  description?: string | null
  sellerNotes?: string | null
  traceDocsAvailable: boolean
  tagAvailable: boolean
  media: PartListingMedia[]
  status: PartListingStatus
  views: number
  contactMetrics: PartContactMetrics
  sellerId: string
  sellerName: string
  sellerPlan: SellerPlanId
  sellerPhone?: string | null
  sellerTextNumber?: string | null
  sellerEmail?: string | null
  priorityRanked?: boolean
  createdAt: string
  updatedAt: string
}

export interface MarketplaceDocumentListing {
  id: string
  listingKind: 'document'
  documentType: DocumentMarketplaceType
  title: string
  aircraftId?: string | null
  documentNumber?: string | null
  manufacturer?: string | null
  revision?: string | null
  aircraftApplicability?: string | null
  description?: string | null
  fileName: string
  fileUrl?: string | null
  pageCount?: number | null
  downloadable: boolean
  injectable: boolean
  previewAvailable: boolean
  isSearchableAfterInject: boolean
  hasAccess: boolean
  hasBeenInjected?: boolean
  accessType: 'free' | 'paid' | 'private'
  listingStatus: 'draft' | 'pending_review' | 'published' | 'rejected'
  priceCents?: number | null
  sellerId?: string | null
  sellerName: string
  sellerSource?: string | null
  sourceDocumentId?: string | null
  sourceDocument?: Pick<
    Document,
    | 'id'
    | 'doc_type'
    | 'document_group_id'
    | 'document_detail_id'
    | 'document_subtype'
    | 'record_family'
    | 'truth_role'
    | 'parser_strategy'
  >
  createdAt: string
  updatedAt: string
}

export interface SellerDashboardStats {
  activeListings: number
  pendingListings: number
  soldListings: number
  totalViews: number
  totalContactClicks: number
  documentUploads: number
}

export interface MarketplaceSellerRow {
  id: string
  listingKind: MarketplaceListingKind
  title: string
  status: string
  subtitle?: string
  priceLabel?: string
  primaryMetricLabel?: string
  primaryMetricValue?: string
  createdAt: string
  updatedAt: string
}

export interface PartLookupResult {
  normalizedPartNumber: string
  title: string
  manufacturer: string
  category: string
  alternatePartNumber?: string | null
  fitsApplicability?: string | null
  description?: string | null
  confidence: 'high' | 'medium' | 'low'
}

export interface DocumentIdentifyResult {
  title: string
  documentType: DocumentMarketplaceType
  manufacturer?: string | null
  aircraftApplicability?: string | null
  revision?: string | null
  documentNumber?: string | null
  description?: string | null
  confidence: 'high' | 'medium' | 'low'
}

export interface AircraftTargetOption {
  id: string
  tailNumber: string
  label: string
}

export interface MarketplacePageData {
  currentUserId: string
  currentUserName: string
  currentUserEmail: string
  currentRole: string
  isAdmin: boolean
  defaultTab: MarketplacePrimaryTab
  defaultMode: MarketplaceMode
  currentAircraftId?: string | null
  aircraftOptions: AircraftTargetOption[]
  sellerPlan: SellerPlanAccount
  listingUsage: ListingUsageSummary
  browsePartListings: MarketplacePartListing[]
  sellerPartListings: MarketplacePartListing[]
  browseDocumentListings: MarketplaceDocumentListing[]
  sellerDocumentListings: MarketplaceDocumentListing[]
  moderationDocumentListings: MarketplaceDocumentListing[]
}

export interface MarketplaceDocumentInjectResult {
  injectedDocumentId: string
  targetScope: Exclude<InjectionTargetScope, 'current_aircraft'>
  aircraftId?: string | null
  downloadUrl?: string | null
}

export type MarketplaceAircraftLike = Pick<Aircraft, 'id' | 'tail_number' | 'make' | 'model'>
