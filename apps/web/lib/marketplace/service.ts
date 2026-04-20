import { searchDocumentTaxonomy } from '@/lib/documents/classification'
import { resolveStoredDocumentClassification } from '@/lib/documents/taxonomy'
import { MARKETPLACE_MANUFACTURERS, MARKETPLACE_SELLER_PLANS, PART_LOOKUP_SEEDS } from '@/lib/marketplace/demo-data'
import type {
  DocumentIdentifyResult,
  DocumentMarketplaceType,
  ListingUsageSummary,
  MarketplaceDocumentListing,
  MarketplacePartListing,
  PartLookupResult,
  SellerPlanAccount,
  SellerPlanDefinition,
} from '@/lib/marketplace/types'
import type { Document } from '@/types'

function slugSearch(value: string) {
  return value.trim().toLowerCase()
}

function buildMarketplaceMediaUrl(path: string) {
  return `/api/marketplace/parts/media?path=${encodeURIComponent(path)}`
}

export function normalizeMarketplacePartNumber(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
}

export function getSellerPlanDefinition(planId: SellerPlanAccount['sellerPlan']): SellerPlanDefinition {
  return MARKETPLACE_SELLER_PLANS.find((plan) => plan.id === planId) ?? MARKETPLACE_SELLER_PLANS[0]
}

export function buildSellerPlanAccountFromRow(
  organizationId: string,
  planRow: Record<string, unknown> | null | undefined,
  activeListingsCount: number
): SellerPlanAccount {
  const sellerPlan = String(planRow?.plan_slug ?? 'starter') as SellerPlanAccount['sellerPlan']
  const definition = getSellerPlanDefinition(sellerPlan)

  return {
    organizationId,
    sellerPlan,
    status: String(planRow?.status ?? 'active') as SellerPlanAccount['status'],
    billingCycle: 'monthly',
    activatedAt: (planRow?.started_at as string | null | undefined) ?? null,
    activeListingsCount,
    listingLimit: definition.listingLimit,
  }
}

export function buildListingUsageSummary(
  sellerPlan: SellerPlanAccount,
  partListings: MarketplacePartListing[]
): ListingUsageSummary {
  const counts = partListings.reduce(
    (acc, listing) => {
      acc[listing.status] += 1
      return acc
    },
    { draft: 0, available: 0, pending: 0, sold: 0, archived: 0 }
  )

  const remainingCount =
    sellerPlan.listingLimit == null
      ? null
      : Math.max(sellerPlan.listingLimit - (counts.available + counts.pending), 0)

  return {
    planId: sellerPlan.sellerPlan,
    activeCount: counts.available + counts.pending,
    draftCount: counts.draft,
    soldCount: counts.sold,
    pendingCount: counts.pending,
    archivedCount: counts.archived,
    listingLimit: sellerPlan.listingLimit,
    remainingCount,
  }
}

export function canCreateAnotherActiveListing(usage: ListingUsageSummary) {
  return usage.listingLimit == null || usage.activeCount < usage.listingLimit
}

export function findPartLookupResult(query: string): PartLookupResult | null {
  const normalized = normalizeMarketplacePartNumber(query)
  if (!normalized) return null

  const exact = PART_LOOKUP_SEEDS.find((item) => item.normalizedPartNumber === normalized)
  if (exact) return exact

  return (
    PART_LOOKUP_SEEDS.find(
      (item) =>
        item.normalizedPartNumber.includes(normalized) ||
        normalized.includes(item.normalizedPartNumber) ||
        slugSearch(item.title).includes(slugSearch(query))
    ) ?? null
  )
}

export function identifyDocumentMetadata(input: {
  title?: string | null
  documentNumber?: string | null
  fileName?: string | null
}): DocumentIdentifyResult {
  const raw = [input.title, input.documentNumber, input.fileName].filter(Boolean).join(' ').trim()
  const normalized = slugSearch(raw)

  const taxonomyMatch = raw ? searchDocumentTaxonomy(raw)[0] : null

  const manufacturer =
    MARKETPLACE_MANUFACTURERS.find((candidate) => normalized.includes(candidate.toLowerCase())) ?? null

  const fallbackType = inferDocumentTypeFromText(normalized)
  const documentType = taxonomyMatch
    ? mapDocTypeToMarketplaceDocumentType(taxonomyMatch.detailId, taxonomyMatch.docType, taxonomyMatch.detailLabel)
    : fallbackType

  const revisionMatch = raw.match(/\b(?:rev|revision)\s*([a-z0-9.-]+)/i)
  const aircraftMatch = raw.match(/\b((?:cessna|piper|beechcraft|cirrus|lycoming|continental)\s+[a-z0-9-]+)/i)
  const number =
    input.documentNumber?.trim() ||
    raw.match(/\b([A-Z0-9-]{4,})\b/)?.[1] ||
    null

  const title =
    input.title?.trim() ||
    raw
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() ||
    'Technical document'

  return {
    title,
    documentType,
    manufacturer,
    aircraftApplicability: aircraftMatch?.[1] ?? null,
    revision: revisionMatch?.[1] ?? null,
    documentNumber: number,
    description:
      taxonomyMatch?.detailLabel
        ? `${taxonomyMatch.detailLabel} identified from the current title or number.`
        : 'Document metadata inferred from the current title, number, or filename.',
    confidence: taxonomyMatch ? 'high' : raw ? 'medium' : 'low',
  }
}

function inferDocumentTypeFromText(normalized: string): DocumentMarketplaceType {
  if (!normalized) return 'document_other'
  if (normalized.includes('ipc')) return 'ipc'
  if (normalized.includes('parts catalog')) return 'parts_catalog'
  if (normalized.includes('service manual')) return 'service_manual'
  if (normalized.includes('maintenance manual')) return 'maintenance_manual'
  if (normalized.includes('structural repair')) return 'structural_repair_manual'
  if (normalized.includes('wiring')) return 'wiring_manual'
  if (normalized.includes('overhaul')) return 'overhaul_manual'
  if (normalized.includes('component maintenance')) return 'component_maintenance_manual'
  if (normalized.includes('manual')) return 'manual'
  return 'document_other'
}

export function mapDocTypeToMarketplaceDocumentType(
  detailId: string,
  docType: Document['doc_type'],
  detailLabel?: string
): DocumentMarketplaceType {
  const normalizedLabel = slugSearch(detailLabel ?? '')

  if (detailId === 'illustrated_parts_catalog_ipc' || normalizedLabel.includes('ipc')) return 'ipc'
  if (normalizedLabel.includes('parts catalog')) return 'parts_catalog'
  if (normalizedLabel.includes('service manual')) return 'service_manual'
  if (normalizedLabel.includes('maintenance manual')) return 'maintenance_manual'
  if (normalizedLabel.includes('structural repair')) return 'structural_repair_manual'
  if (normalizedLabel.includes('wiring')) return 'wiring_manual'
  if (normalizedLabel.includes('overhaul')) return 'overhaul_manual'
  if (normalizedLabel.includes('component maintenance')) return 'component_maintenance_manual'

  if (docType === 'maintenance_manual') return 'maintenance_manual'
  if (docType === 'service_manual') return 'service_manual'
  if (docType === 'parts_catalog') return 'parts_catalog'

  return docType === 'miscellaneous' ? 'document_other' : 'manual'
}

export function getDocumentTypeLabel(type: DocumentMarketplaceType) {
  switch (type) {
    case 'maintenance_manual':
      return 'Maintenance Manual'
    case 'service_manual':
      return 'Service Manual'
    case 'parts_catalog':
      return 'Parts Catalog'
    case 'ipc':
      return 'IPC'
    case 'wiring_manual':
      return 'Wiring Manual'
    case 'structural_repair_manual':
      return 'Structural Repair Manual'
    case 'overhaul_manual':
      return 'Overhaul Manual'
    case 'component_maintenance_manual':
      return 'Component Maintenance Manual'
    case 'document_other':
      return 'Other Technical Document'
    default:
      return 'Manual'
  }
}

export function documentMatchesMarketplaceSearch(listing: MarketplaceDocumentListing, query: string) {
  const normalized = slugSearch(query)
  if (!normalized) return true

  return [
    listing.title,
    listing.documentNumber,
    listing.manufacturer,
    listing.aircraftApplicability,
    listing.description,
    listing.sellerName,
    listing.revision,
  ]
    .filter(Boolean)
    .some((value) => slugSearch(String(value)).includes(normalized))
}

export function partMatchesMarketplaceSearch(listing: MarketplacePartListing, query: string) {
  const normalized = slugSearch(query)
  if (!normalized) return true

  return [
    listing.title,
    listing.partNumber,
    listing.alternatePartNumber,
    listing.manufacturer,
    listing.category,
    listing.subcategory,
    listing.fitsApplicability,
    listing.location,
    listing.description,
  ]
    .filter(Boolean)
    .some((value) => slugSearch(String(value)).includes(normalized))
}

export function buildMarketplaceDocumentListing(
  document: Pick<
    Document,
    | 'id'
    | 'title'
    | 'doc_type'
    | 'description'
    | 'file_name'
    | 'page_count'
    | 'manual_access'
    | 'marketplace_downloadable'
    | 'marketplace_injectable'
    | 'marketplace_preview_available'
    | 'price_cents'
    | 'listing_status'
    | 'uploaded_by'
    | 'uploader_name'
    | 'document_group_id'
    | 'document_detail_id'
    | 'document_subtype'
    | 'record_family'
    | 'truth_role'
    | 'parser_strategy'
    | 'revision'
    | 'updated_at'
    | 'uploaded_at'
  > & {
    aircraft?: { id?: string | null; make?: string | null; model?: string | null; tail_number?: string | null } | null
  }
): MarketplaceDocumentListing {
  const classification = resolveStoredDocumentClassification(document)
  const documentType = mapDocTypeToMarketplaceDocumentType(
    classification.detailId,
    document.doc_type,
    classification.detailLabel
  )
  const accessType = document.manual_access === 'paid' ? 'paid' : document.manual_access === 'free' ? 'free' : 'private'
  const downloadable = accessType !== 'private' && document.marketplace_downloadable !== false
  const injectable = accessType !== 'private' && document.marketplace_injectable !== false
  const previewAvailable =
    document.marketplace_preview_available !== false && Boolean(document.page_count && document.page_count > 0)

  const manufacturer = document.aircraft?.make ?? inferManufacturerFromTitle(document.title)
  const aircraftApplicability = document.aircraft
    ? `${document.aircraft.make ?? ''} ${document.aircraft.model ?? ''}`.trim() || document.aircraft.tail_number || null
    : null

  return {
    id: document.id,
    listingKind: 'document',
    documentType,
    title: document.title,
    aircraftId: document.aircraft?.id ?? null,
    documentNumber: document.document_subtype ?? null,
    manufacturer,
    revision: document.revision ?? null,
    aircraftApplicability,
    description: document.description ?? `${classification.detailLabel} · ${classification.groupLabel}`,
    fileName: document.file_name,
    fileUrl: null,
    pageCount: document.page_count ?? null,
    downloadable,
    injectable,
    previewAvailable,
    isSearchableAfterInject: true,
    hasAccess: accessType === 'free',
    hasBeenInjected: false,
    accessType,
    listingStatus: (document.listing_status as MarketplaceDocumentListing['listingStatus']) ?? 'draft',
    priceCents: document.price_cents ?? null,
    sellerId: document.uploaded_by ?? null,
    sellerName: document.uploader_name ?? 'Marketplace contributor',
    sellerSource: 'Community listing',
    sourceDocumentId: document.id,
    sourceDocument: {
      id: document.id,
      doc_type: document.doc_type,
      document_group_id: document.document_group_id ?? undefined,
      document_detail_id: document.document_detail_id ?? undefined,
      document_subtype: document.document_subtype ?? undefined,
      record_family: document.record_family ?? undefined,
      truth_role: document.truth_role ?? undefined,
      parser_strategy: document.parser_strategy ?? undefined,
    },
    createdAt: document.uploaded_at,
    updatedAt: document.updated_at,
  }
}

function inferManufacturerFromTitle(title: string) {
  const normalized = slugSearch(title)
  return (
    MARKETPLACE_MANUFACTURERS.find((candidate) => normalized.includes(candidate.toLowerCase())) ?? null
  )
}

export function formatMarketplacePrice(cents?: number | null) {
  if (cents == null) return 'Free'
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

export function mapMarketplacePartListingRow(row: Record<string, unknown>): MarketplacePartListing {
  const call = Number(row.call_click_count ?? 0)
  const text = Number(row.text_click_count ?? 0)
  const email = Number(row.email_click_count ?? 0)
  const sellerPlan = String(row.seller_plan_slug ?? 'starter') as MarketplacePartListing['sellerPlan']
  const rawMedia = Array.isArray(row.media_json) ? row.media_json : []
  const media = rawMedia
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item, index) => {
      const storagePath =
        (item.storagePath as string | undefined) ??
        (item.storage_path as string | undefined) ??
        undefined
      const fallbackUrl = typeof item.url === 'string' ? item.url : null
      const mediaType = String(item.type ?? 'image') === 'video' ? 'video' : 'image'
      return {
        id: String(item.id ?? `media-${index}`),
        type: mediaType as 'image' | 'video',
        alt: String(item.alt ?? item.fileName ?? item.file_name ?? 'Marketplace media'),
        url: fallbackUrl ?? (storagePath ? buildMarketplaceMediaUrl(storagePath) : ''),
        storagePath,
        mimeType:
          (item.mimeType as string | undefined) ??
          (item.mime_type as string | undefined) ??
          undefined,
        fileName:
          (item.fileName as string | undefined) ??
          (item.file_name as string | undefined) ??
          undefined,
        sizeBytes:
          typeof item.sizeBytes === 'number'
            ? item.sizeBytes
            : typeof item.size_bytes === 'number'
              ? item.size_bytes
              : undefined,
      }
    })
    .filter((item) => Boolean(item.url))

  return {
    id: String(row.id),
    listingKind: 'part',
    title: String(row.title ?? 'Untitled part listing'),
    partNumber: String(row.part_number ?? ''),
    alternatePartNumber: (row.alternate_part_number as string | null | undefined) ?? null,
    manufacturer: String(row.manufacturer ?? 'Unknown manufacturer'),
    category: String(row.category ?? 'General'),
    subcategory: (row.subcategory as string | null | undefined) ?? null,
    condition: String(row.condition ?? 'serviceable') as MarketplacePartListing['condition'],
    priceCents: Number(row.price_cents ?? 0),
    quantity: Number(row.quantity ?? 1),
    location: String(row.location ?? 'Unspecified'),
    serialNumber: (row.serial_number as string | null | undefined) ?? null,
    fitsApplicability: (row.fits_applicability as string | null | undefined) ?? null,
    description: (row.description as string | null | undefined) ?? null,
    sellerNotes: (row.seller_notes as string | null | undefined) ?? null,
    traceDocsAvailable: Boolean(row.trace_docs_available),
    tagAvailable: Boolean(row.cert_tag_available),
    media,
    status: String(row.status ?? 'draft') as MarketplacePartListing['status'],
    views: Number(row.view_count ?? 0),
    contactMetrics: {
      call,
      text,
      email,
      total: Number(row.contact_click_count ?? call + text + email),
    },
    sellerId: String(row.seller_user_id ?? row.organization_id ?? ''),
    sellerName:
      (row.contact_name as string | null | undefined) ??
      (row.organization_name as string | null | undefined) ??
      'Marketplace seller',
    sellerPlan,
    sellerPhone: (row.contact_phone as string | null | undefined) ?? null,
    sellerTextNumber: (row.contact_text as string | null | undefined) ?? (row.contact_phone as string | null | undefined) ?? null,
    sellerEmail: (row.contact_email as string | null | undefined) ?? null,
    priorityRanked: Number(row.featured_rank ?? 0) > 0,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  }
}
