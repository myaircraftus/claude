/**
 * Persona-scoped document rules — LEGACY `DocType` adapter.
 *
 * SOP-DOC-001 §8.4 — `lib/documents/persona-taxonomy.ts` is the SINGLE
 * SOURCE OF TRUTH for document persona permissions. This module used to
 * keep its own hand-maintained owner / shop / shared `DocType` sets, and
 * they drifted out of sync with the taxonomy — e.g. it had
 * `airworthiness_directive` owner-only, while the taxonomy (correctly, per
 * SOP §4.2) has AD/SB documents shop-uploaded.
 *
 * That duplication is now gone. This module exists ONLY to answer the same
 * permission question for the legacy `doc_type` enum (`DocType`, mig 004):
 * it maps each legacy `DocType` to its modern `DocumentType` via
 * `inferDocumentTypeFromLegacy` and delegates to `canPersonaUpload`. Every
 * ruling is derived — persona-scope and persona-taxonomy can no longer
 * disagree.
 */
import type { DocType } from '@/types'
import { canPersonaUpload, inferDocumentTypeFromLegacy } from './persona-taxonomy'

/** UI persona. `admin` is handled inside persona-taxonomy.ts, not here. */
export type Persona = 'owner' | 'shop'

/** Every legal legacy `doc_type` enum value (mig 004). */
const DOC_TYPE_VALUES: readonly DocType[] = [
  'logbook',
  'poh',
  'afm',
  'afm_supplement',
  'maintenance_manual',
  'service_manual',
  'parts_catalog',
  'service_bulletin',
  'airworthiness_directive',
  'work_order',
  'inspection_report',
  'form_337',
  'stc',
  'form_8130',
  'lease_ownership',
  'insurance',
  'compliance',
  'miscellaneous',
]

/**
 * `miscellaneous` is the one legacy `DocType` with no modern-taxonomy
 * equivalent — `inferDocumentTypeFromLegacy` maps it lossily to `other`,
 * which both personas may upload. An unclassified document could be
 * anything, including an owner's private lockbox record, so it stays
 * owner-scoped here rather than inheriting `other`'s shared scope. This is
 * a deliberate legacy-only safety decision — it scopes a value the source
 * of truth simply does not model, so it is not a competing rule table.
 */
const LEGACY_OWNER_SCOPED: ReadonlySet<DocType> = new Set<DocType>(['miscellaneous'])

/** Can `persona` UPLOAD this legacy `DocType`? Derived from persona-taxonomy. */
export function personaCanUpload(persona: Persona | 'mechanic', docType: DocType): boolean {
  if (LEGACY_OWNER_SCOPED.has(docType)) return persona === 'owner'
  return canPersonaUpload(persona, inferDocumentTypeFromLegacy(docType))
}

/**
 * Can `persona` SEE this legacy `DocType` in their documents list? Same
 * rule as upload — a shop must not browse owner aircraft records, and an
 * owner must not browse shop-internal MRO references (SOP §1.1).
 */
export function personaCanView(persona: Persona, docType: DocType): boolean {
  return personaCanUpload(persona, docType)
}

/** Human-readable rejection message when persona-scope blocks an upload. */
export function buildPersonaRejection(docType: DocType): string {
  const human = docType.replace(/_/g, ' ')
  if (!personaCanUpload('shop', docType)) {
    // Owner-only document type — a shop attempted the upload.
    return (
      `"${human}" is an aircraft-specific owner record. It can only be ` +
      `uploaded from the Owner persona — switch personas, or ask the ` +
      `aircraft owner to upload it from their account.`
    )
  }
  if (!personaCanUpload('owner', docType)) {
    // Shop-only document type — an owner attempted the upload.
    return (
      `"${human}" is a shop reference / operational document. It can only ` +
      `be uploaded from the Shop persona.`
    )
  }
  return `"${human}" cannot be uploaded by this persona.`
}

/**
 * Filter every legacy `DocType` down to those a persona can see / upload.
 * Used by the persona-aware documents list to build its WHERE clause.
 */
export function docTypesForPersona(persona: Persona): DocType[] {
  return DOC_TYPE_VALUES.filter((dt) => personaCanView(persona, dt))
}
