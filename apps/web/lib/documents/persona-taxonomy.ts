// SOURCE OF TRUTH for document persona permissions.
// shopCanUpload: false = owner-only upload. See SOP-DOC-001 Section 4.
// Do NOT modify without updating SOP-DOC-001.
//
// lib/documents/persona-scope.ts answers the same question for the legacy
// `doc_type` enum — it DERIVES every ruling from this file and must never
// re-introduce its own permission table.
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
  // Modifications & alterations
  'stc',
  'form_337',
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
  shopCanUpload: boolean
  /** Admin can always upload — listed for symmetry. Always true. */
  adminCanUpload: true
}

/**
 * Persona × type matrix, mirrored byte-for-byte by the RLS policy in mig 103
 * as updated by mig 119 (Phase 18: mechanic merged into shop).
 *
 * If you edit this table, also update the migration's CASE statement.
 *
 * mechanicCanUpload was dropped in Phase 18 — the shop persona now owns
 * everything the mechanic role could previously upload.
 *
 * Lockdown (mig 20260517110000): the shop persona's RLS rule is an explicit
 * ALLOWLIST of reference + operations document_types — it can no longer insert
 * ANY aircraft_* historical record (logbook, registration, airworthiness,
 * insurance, POH, AFM, weight & balance, prebuy, annual, 100hr), STC, or
 * Form 337. Those are owner-only. The shopCanUpload flags below mirror that
 * allowlist byte-for-byte.
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
    shopCanUpload: false, // aircraft historical record — owner-only by policy
    adminCanUpload: true,
  },
  aircraft_insurance: {
    id: 'aircraft_insurance',
    label: 'Insurance Policy',
    description: 'Hull or liability insurance certificate.',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    shopCanUpload: false, // aircraft historical record — owner-only by policy
    adminCanUpload: true,
  },
  aircraft_poh: {
    id: 'aircraft_poh',
    label: 'POH',
    description: "Pilot's Operating Handbook for this aircraft.",
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    shopCanUpload: false, // aircraft historical record — owner-only by policy
    adminCanUpload: true,
  },
  aircraft_afm: {
    id: 'aircraft_afm',
    label: 'AFM',
    description: 'Aircraft Flight Manual or supplement.',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    shopCanUpload: false, // aircraft historical record — owner-only by policy
    adminCanUpload: true,
  },
  aircraft_weight_balance: {
    id: 'aircraft_weight_balance',
    label: 'Weight & Balance',
    description: 'W&B record specific to this aircraft.',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    shopCanUpload: false, // aircraft historical record — owner-only by policy
    adminCanUpload: true,
  },
  aircraft_prebuy: {
    id: 'aircraft_prebuy',
    label: 'Pre-buy Inspection',
    description: 'Pre-purchase inspection report.',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    shopCanUpload: false, // aircraft historical record — owner-only by policy
    adminCanUpload: true,
  },
  aircraft_annual: {
    id: 'aircraft_annual',
    label: 'Annual Inspection',
    description: 'Annual inspection sign-off / report.',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    shopCanUpload: false, // aircraft historical record — owner-only by policy
    adminCanUpload: true,
  },
  aircraft_100hr: {
    id: 'aircraft_100hr',
    label: '100-Hour Inspection',
    description: '100-hour inspection sign-off / report.',
    category: 'Aircraft Records',
    requiresAircraftId: true,
    ownerCanUpload: true,
    shopCanUpload: false, // aircraft historical record — owner-only by policy
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
    shopCanUpload: true,
    adminCanUpload: true,
  },

  // ─── Modifications & Alterations ──────────────────────────────────────────
  // STC and Form 337 are aircraft permanent records — owner-persona uploads
  // (consistent with form_337 being OWNER_ONLY in persona-scope.ts).
  stc: {
    id: 'stc',
    label: 'STC (Supplemental Type Certificate)',
    description: 'FAA Supplemental Type Certificate authorizing an aircraft modification.',
    category: 'Compliance',
    requiresAircraftId: false,
    ownerCanUpload: true,
    shopCanUpload: false,
    adminCanUpload: true,
  },
  form_337: {
    id: 'form_337',
    label: 'Form 337 (Major Repair & Alteration)',
    description: 'FAA Form 337 documenting a major repair or major alteration on this aircraft.',
    category: 'Compliance',
    requiresAircraftId: true,
    ownerCanUpload: true,
    shopCanUpload: false,
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

/**
 * Authoritative client-side check — mirrors the RLS matrix in mig 103 +
 * the Phase 18 collapse in mig 119.
 *
 * Phase 18: the mechanic persona was merged into shop. The mechanicCanUpload
 * field is gone from the type meta. Any caller still passing 'mechanic'
 * (e.g. a stale in-memory session value) is treated as shop so the UI never
 * crashes on an unknown branch.
 */
export function canPersonaUpload(persona: Persona | 'mechanic', documentType: DocumentType): boolean {
  const meta = DOCUMENT_TYPE_META[documentType]
  if (!meta) return false
  switch (persona) {
    case 'admin':
      return meta.adminCanUpload
    case 'shop':
    case 'mechanic':
      return meta.shopCanUpload
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
      return 'form_337'
    case 'stc':
      return 'stc'
    case 'form_8130':
    case 'compliance':
    case 'miscellaneous':
    default:
      return 'other'
  }
}
