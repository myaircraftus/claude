/**
 * Phase 13.1 — zod schemas for the persona-strict document upload pipeline.
 *
 * Used by /api/documents/upload (Sprint 13.2) and any other route that
 * accepts a document_type / aircraft_id pair. Mirrors the CHECK constraint
 * from mig 103 so client and server agree on the universe of legal values.
 */
import { z } from 'zod'
import { DOCUMENT_TYPES } from './persona-taxonomy'
import { safeShortStr, safeUuid, safeUuidOptional } from '@/lib/validation/common'

/** zod enum for the new document_type column. */
export const DocumentTypeSchema = z.enum(DOCUMENT_TYPES)

/** Persona enum — kept here (not in persona/config) so the schema layer is self-contained.
 * Phase 18 mig 119: collapsed to 3 personas. Stale 'mechanic' input is rejected
 * at the schema layer; callers should normalize via lib/persona/config.ts:resolvePersona. */
export const PersonaSchema = z.enum(['owner', 'shop', 'admin'])

/**
 * Body of /api/documents/upload (the metadata leg — file is in form-data
 * multipart and validated separately by the upload route's own size/mime
 * checks).
 *
 * `aircraft_id`: optional at this layer; the route validates "required iff
 * requiresAircraftId(document_type)" using the taxonomy helper, so we keep
 * the schema permissive and let the business rule live where it can read
 * the type.
 */
export const DocumentUploadMetadataSchema = z.object({
  title: safeShortStr,
  document_type: DocumentTypeSchema,
  aircraft_id: safeUuidOptional,
  organization_id: safeUuid,
  /** Optional override; usually inferred server-side from the session. */
  uploaded_by_persona: PersonaSchema.optional(),
})

export type DocumentUploadMetadata = z.infer<typeof DocumentUploadMetadataSchema>
