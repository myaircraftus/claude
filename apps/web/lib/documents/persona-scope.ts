/**
 * Persona-scoped document rules.
 *
 * Owners and mechanics see different documents and can upload different
 * documents — same database, different lens:
 *
 *   OWNER persona:    aircraft-specific records that belong to a tail
 *                     (logbooks, ADs, work orders, registration, insurance,
 *                     inspection reports, 337s, 8130s).
 *
 *   MECHANIC persona: maintenance reference / shop documentation that
 *                     applies across aircraft (maintenance manuals, service
 *                     manuals, parts catalogs, service bulletins, POH/AFM
 *                     for reference).
 *
 * Strict enforcement on upload: if a user is on the mechanic persona and
 * tries to upload a logbook (or any owner-only DocType), the server rejects
 * the upload with a clear "this belongs to the aircraft owner" message.
 *
 * If a user has both personas, they should switch to "Owner" to upload an
 * aircraft logbook. Mechanic uploads stay scoped to shop documentation.
 */

import type { DocType } from '@/types'

/** DocTypes that are aircraft-specific records — owner-only by default. */
export const OWNER_ONLY_DOC_TYPES: ReadonlySet<DocType> = new Set<DocType>([
  'logbook',                  // engine / airframe / prop / avionics logs
  'inspection_report',        // annual / 100-hr inspection
  'form_337',                 // major repair / alteration on THIS aircraft
  'form_8130',                // 8130-3 airworthiness tag for installed parts
  'airworthiness_directive',  // AD compliance record for THIS aircraft
  'work_order',               // shop work order tied to a tail
  'lease_ownership',          // title / registration / bill of sale
  'insurance',                // policy / binder
  'compliance',               // generic compliance / certificate
])

/** DocTypes that are mechanic shop-reference materials. */
export const MECHANIC_REFERENCE_DOC_TYPES: ReadonlySet<DocType> = new Set<DocType>([
  'maintenance_manual',
  'service_manual',
  'parts_catalog',
  'service_bulletin',
])

/**
 * DocTypes visible to both personas. Currently POH / AFM / AFM supplement —
 * they're aircraft-specific (live with the airframe) but mechanics also
 * routinely consult them. miscellaneous is also shown to both because we
 * can't infer scope. Auto-classifier may move it later.
 */
export const SHARED_DOC_TYPES: ReadonlySet<DocType> = new Set<DocType>([
  'poh',
  'afm',
  'afm_supplement',
  'miscellaneous',
])

export type Persona = 'owner' | 'mechanic'

/**
 * Can the given persona UPLOAD this DocType?
 * - Owner can upload anything.
 * - Mechanic can only upload reference + shared types.
 */
export function personaCanUpload(persona: Persona, docType: DocType): boolean {
  if (persona === 'owner') return true
  if (MECHANIC_REFERENCE_DOC_TYPES.has(docType)) return true
  if (SHARED_DOC_TYPES.has(docType)) return true
  return false
}

/**
 * Can the given persona SEE this DocType in their documents list?
 * Same rule as upload — mechanics shouldn't browse aircraft logbooks
 * because those are owner records.
 */
export function personaCanView(persona: Persona, docType: DocType): boolean {
  return personaCanUpload(persona, docType)
}

/**
 * Human-readable rejection message when persona-scope blocks an upload.
 * Used by both /api/upload/init and /api/upload/complete so the client
 * sees the same copy.
 */
export function buildPersonaRejection(docType: DocType): string {
  if (OWNER_ONLY_DOC_TYPES.has(docType)) {
    return (
      `"${docType.replace(/_/g, ' ')}" is an aircraft-specific record and ` +
      `belongs to the aircraft owner. Switch to the Owner persona to upload ` +
      `this — or, if you only have a mechanic role, ask the aircraft owner ` +
      `to upload it from their account.`
    )
  }
  return (
    `Mechanic accounts can only upload shop reference documents ` +
    `(maintenance manuals, service manuals, parts catalogs, service bulletins, ` +
    `POH / AFM). Switch to Owner persona to upload aircraft records.`
  )
}

/**
 * Filter a list of DocType values to those a persona can see/upload.
 * Used by the persona-aware document list to produce the correct WHERE
 * clause input.
 */
export function docTypesForPersona(persona: Persona): DocType[] {
  if (persona === 'owner') {
    return [
      ...OWNER_ONLY_DOC_TYPES,
      ...MECHANIC_REFERENCE_DOC_TYPES,
      ...SHARED_DOC_TYPES,
    ] as DocType[]
  }
  return [...MECHANIC_REFERENCE_DOC_TYPES, ...SHARED_DOC_TYPES] as DocType[]
}
