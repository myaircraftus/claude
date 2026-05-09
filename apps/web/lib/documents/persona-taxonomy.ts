/**
 * Phase 13.1 — persona-strict document type taxonomy.
 *
 * Single source of truth for the new `document_type` column added in mig 103.
 * Lives alongside the legacy `taxonomy.ts` (which models the existing 4-level
 * scanner taxonomy) — this module describes the *upload-permission* taxonomy
 * the new persona-strict UI uses.
 *
 * The DB CHECK constraint in mig 103 mirrors `DOCUMENT_TYPES`. The RLS INSERT
 * policy in mig 103 mirrors the persona × type matrix below. Edits here MUST
 * be replicated to mig 103 (and a follow-up migration if 103 has shipped).
 *
 * UI gating reads from this module. The server upload route (Sprint 13.2)
 * re-checks via `canPersonaUpload` before insert so the user gets a clean 403
 * instead of an opaque RLS denial.
 */
import type { Persona } from '@/types'

/** All legal document_type values. Must stay in sync with mig 103. */
export const DOCUMENT_TYPES = [
  // Aircraft-specific (require aircraft_id)
  'aircraft_logbook',
  'aircraft_registration',
  'aircraft_airworthiness',
  'aircraft_insurance',
  'aircraft_poh',
  'aircraft_afm',
  'aircraft_weight_balance',
  'aircraft_prebuy',
  'aircraft_annual',
  'aircraft_100hr',
  // Reference manuals (no aircraft_id)
  'maintenance_manual',
  'parts_catalog',
  'service_bulletin',
  'airworthiness_directive',
  'wiring_diagram',
  'service_letter',
  'tcds',
  'training_manual',
  // Operations
  'photo',
  'receipt',
  'invoice',
  'work_order_attachment',
  // Other
  'other',
] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]

/** Display category — drives the upload modal accordion grouping. */
export type DocumentCategory =
  | 'Aircraft Records'
  | 'Reference Manuals'
  | 'Compliance'
  | 'Operations'
  | 'Other'

export interface DocumentTypeMeta {
  id: DocumentType
  label: string
  description: string
  category: DocumentCategory
  requiresAircraftId: boolean
  ownerCanUpload: boolean
  mechanicCanUpload: boolean
  shopCanUpload: boolean
  /** Admin can always upload — listed for symmetry. Always true. */
  adminCanUpload: true
}

/**
 * Persona × type matrix, mirrored byte-for-byte by the RLS policy in mig 103.
 * If you edit this table, also update the migration's CASE statement.
 */
export const DOCUMENT_TYPE_META: Record<DocumentType, DocumentTypeMeta> = {
  // ─── Aircraft Records ─────────────────────────────────────────────────────
  aircraft_logbook: {
    id: 'aircraft_logbook',
    label: 'Aircraft Logbook',
    description: 'Aircraft, engine, or propeller logbook.',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    mechanicCanUpload: false,
    shopCanUpload: false, // sensitive — owner-only by policy
    adminCanUpload: true,
  },
  aircraft_registration: {
    id: 'aircraft_registration',
    label: 'Registration',
    description: 'FAA registration certificate (8050-3).',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    mechanicCanUpload: false,
    shopCanUpload: false, // sensitive — owner-only by policy
    adminCanUpload: true,
  },
  aircraft_airworthiness: {
    id: 'aircraft_airworthiness',
    label: 'Airworthiness Certificate',
    description: 'FAA airworthiness certificate (8100-2).',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    mechanicCanUpload: false,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  aircraft_insurance: {
    id: 'aircraft_insurance',
    label: 'Insurance Policy',
    description: 'Hull or liability insurance certificate.',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    mechanicCanUpload: false,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  aircraft_poh: {
    id: 'aircraft_poh',
    label: 'POH',
    description: "Pilot's Operating Handbook for this aircraft.",
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    mechanicCanUpload: false,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  aircraft_afm: {
    id: 'aircraft_afm',
    label: 'AFM',
    description: 'Aircraft Flight Manual or supplement.',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    mechanicCanUpload: false,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  aircraft_weight_balance: {
    id: 'aircraft_weight_balance',
    label: 'Weight & Balance',
    description: 'W&B record specific to this aircraft.',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    mechanicCanUpload: false,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  aircraft_prebuy: {
    id: 'aircraft_prebuy',
    label: 'Pre-buy Inspection',
    description: 'Pre-purchase inspection report.',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    mechanicCanUpload: false,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  aircraft_annual: {
    id: 'aircraft_annual',
    label: 'Annual Inspection',
    description: 'Annual inspection sign-off / report.',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    mechanicCanUpload: false,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  aircraft_100hr: {
    id: 'aircraft_100hr',
    label: '100-Hour Inspection',
    description: '100-hour inspection sign-off / report.',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    mechanicCanUpload: false,
    shopCanUpload: true,
    adminCanUpload: true,
  },

  // ─── Reference Manuals ────────────────────────────────────────────────────
  maintenance_manual: {
    id: 'maintenance_manual',
    label: 'Maintenance Manual',
    description: 'Manufacturer maintenance manual.',
    category: 'Reference Manuals',
    requiresAircraftId: false,
    ownerCanUpload: false,
    mechanicCanUpload: true,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  parts_catalog: {
    id: 'parts_catalog',
    label: 'Parts Catalog',
    description: 'Illustrated parts catalog (IPC).',
    category: 'Reference Manuals',
    requiresAircraftId: false,
    ownerCanUpload: false,
    mechanicCanUpload: true,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  service_bulletin: {
    id: 'service_bulletin',
    label: 'Service Bulletin',
    description: 'Manufacturer service bulletin (SB).',
    category: 'Compliance',
    requiresAircraftId: false,
    ownerCanUpload: false,
    mechanicCanUpload: true,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  airworthiness_directive: {
    id: 'airworthiness_directive',
    label: 'Airworthiness Directive',
    description: 'FAA Airworthiness Directive (AD).',
    category: 'Compliance',
    requiresAircraftId: false,
    ownerCanUpload: false,
    mechanicCanUpload: true,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  wiring_diagram: {
    id: 'wiring_diagram',
    label: 'Wiring Diagram',
    description: 'Aircraft electrical / avionics wiring diagram.',
    category: 'Reference Manuals',
    requiresAircraftId: false,
    ownerCanUpload: false,
    mechanicCanUpload: true,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  service_letter: {
    id: 'service_letter',
    label: 'Service Letter',
    description: 'Manufacturer service letter (SL).',
    category: 'Compliance',
    requiresAircraftId: false,
    ownerCanUpload: false,
    mechanicCanUpload: true,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  tcds: {
    id: 'tcds',
    label: 'Type Certificate Data Sheet',
    description: 'FAA Type Certificate Data Sheet (TCDS).',
    category: 'Compliance',
    requiresAircraftId: false,
    ownerCanUpload: false,
    mechanicCanUpload: true,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  training_manual: {
    id: 'training_manual',
    label: 'Training Manual',
    description: 'Pilot or technician training manual.',
    category: 'Reference Manuals',
    requiresAircraftId: false,
    ownerCanUpload: false,
    mechanicCanUpload: true,
    shopCanUpload: true,
    adminCanUpload: true,
  },

  // ─── Operations ───────────────────────────────────────────────────────────
  photo: {
    id: 'photo',
    label: 'Photo',
    description: 'Photograph of the aircraft, part, or job.',
    category: 'Operations',
    requiresAircraftId: false,
    ownerCanUpload: true,
    mechanicCanUpload: true,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  receipt: {
    id: 'receipt',
    label: 'Receipt',
    description: 'Purchase receipt, fuel slip, etc.',
    category: 'Operations',
    requiresAircraftId: false,
    ownerCanUpload: true,
    mechanicCanUpload: true,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  invoice: {
    id: 'invoice',
    label: 'Invoice',
    description: 'Customer invoice.',
    category: 'Operations',
    requiresAircraftId: false,
    ownerCanUpload: false, // owners don't issue invoices
    mechanicCanUpload: true,
    shopCanUpload: true,
    adminCanUpload: true,
  },
  work_order_attachment: {
    id: 'work_order_attachment',
    label: 'Work Order Attachment',
    description: 'File attached to a work order.',
    category: 'Operations',
    requiresAircraftId: false,
    ownerCanUpload: false,
    mechanicCanUpload: true,
    shopCanUpload: true,
    adminCanUpload: true,
  },

  // ─── Other ────────────────────────────────────────────────────────────────
  other: {
    id: 'other',
    label: 'Other',
    description: 'Anything that does not fit a specific category.',
    category: 'Other',
    requiresAircraftId: false,
    ownerCanUpload: true,
    mechanicCanUpload: true,
    shopCanUpload: true,
    adminCanUpload: true,
  },
}

/** Ordered list of categories for stable accordion rendering. */
export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'Aircraft Records',
  'Reference Manuals',
  'Compliance',
  'Operations',
  'Other',
]

export function getCategoryTypes(category: DocumentCategory): DocumentTypeMeta[] {
  return DOCUMENT_TYPES.map((id) => DOCUMENT_TYPE_META[id]).filter(
    (meta) => meta.category === category,
  )
}

/** Authoritative client-side check — mirrors the RLS matrix in mig 103. */
export function canPersonaUpload(persona: Persona, documentType: DocumentType): boolean {
  const meta = DOCUMENT_TYPE_META[documentType]
  if (!meta) return false
  switch (persona) {
    case 'admin':
      return meta.adminCanUpload
    case 'shop':
      return meta.shopCanUpload
    case 'mechanic':
      return meta.mechanicCanUpload
    case 'owner':
      return meta.ownerCanUpload
    default:
      return false
  }
}

/** Returns every type the persona is allowed to upload. */
export function getAllowedUploadTypes(persona: Persona): DocumentTypeMeta[] {
  return DOCUMENT_TYPES.map((id) => DOCUMENT_TYPE_META[id]).filter((meta) =>
    canPersonaUpload(persona, meta.id),
  )
}

/** Returns the categories that contain ≥1 type the persona can upload. */
export function getAllowedCategories(persona: Persona): DocumentCategory[] {
  const allowed = new Set(getAllowedUploadTypes(persona).map((m) => m.category))
  return DOCUMENT_CATEGORIES.filter((c) => allowed.has(c))
}

/** Convenience: does this type require an aircraft_id? */
export function requiresAircraftId(documentType: DocumentType): boolean {
  return DOCUMENT_TYPE_META[documentType]?.requiresAircraftId ?? false
}

/** Type guard for runtime validation. */
export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value)
}

/**
 * Map a legacy `doc_type` (mig 004 enum) → new `document_type`. Mirrors the
 * backfill CASE in mig 103. Used by the upload route as a fallback when a
 * client sends only the legacy field.
 */
export function inferDocumentTypeFromLegacy(legacy: string | null | undefined): DocumentType {
  switch (legacy) {
    case 'logbook':
      return 'aircraft_logbook'
    case 'poh':
      return 'aircraft_poh'
    case 'afm':
    case 'afm_supplement':
      return 'aircraft_afm'
    case 'maintenance_manual':
    case 'service_manual':
      return 'maintenance_manual'
    case 'parts_catalog':
      return 'parts_catalog'
    case 'service_bulletin':
      return 'service_bulletin'
    case 'airworthiness_directive':
      return 'airworthiness_directive'
    case 'work_order':
      return 'work_order_attachment'
    case 'inspection_report':
      return 'aircraft_annual'
    case 'lease_ownership':
      return 'aircraft_registration'
    case 'insurance':
      return 'aircraft_insurance'
    case 'form_337':
    case 'form_8130':
    case 'compliance':
    case 'miscellaneous':
    default:
      return 'other'
  }
}
