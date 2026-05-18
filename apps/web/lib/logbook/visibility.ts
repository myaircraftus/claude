/**
 * Owner logbook-entry visibility gate.
 *
 * Owners see logbook entries that have been published to them (owner_visible
 * = true — set when a mechanic signs the entry), that the owner created
 * themselves, or that are `historical` (OCR-transcribed records from the
 * owner's own already-completed paper logbooks — the owner's documents, always
 * theirs to retrieve). Shop / mechanic / admin personas see everything,
 * including unsigned drafts.
 *
 * This is the app-layer companion to the persona-aware `logbook_select` RLS
 * policy (migration 20260517120000). RLS is the airtight, by-construction
 * gate — it covers every read through the user-scoped Supabase client — and
 * this helper keeps the same rule explicit at the primary owner-facing query
 * sites so the intent is visible in code.
 */

/** The persona value that the visibility gate restricts. */
export const OWNER_PERSONA = 'owner'

/**
 * Apply the owner logbook-entry visibility filter to a Supabase query builder.
 *
 * For the owner persona it narrows to `owner_visible = true OR created_by =
 * <userId> OR status = 'historical'`. For every other persona (shop /
 * mechanic / admin) the query is returned unchanged — they keep full
 * visibility.
 *
 * Generic over any Postgrest builder exposing `.or()`.
 */
export function applyOwnerLogbookVisibility<T extends { or(filter: string): T }>(
  query: T,
  persona: string | null | undefined,
  userId: string,
): T {
  if (persona !== OWNER_PERSONA) return query
  return query.or(`owner_visible.eq.true,created_by.eq.${userId},status.eq.historical`)
}
