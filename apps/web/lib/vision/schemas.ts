/**
 * Phase 8 Vision RAG — public zod schemas (Sprint 8.4).
 *
 * Re-exports schemas from the various submodules so API routes have a
 * single import surface. Keeps each module's schema close to its
 * implementation while still letting routes use one import.
 */
export {
  VisionPageCreateSchema,
  VisionPagePatchSchema,
  VisionIndexJobCreateSchema,
  VisionIndexJobPatchSchema,
} from './registry'

export { SearchQuerySchema } from './index-query'
