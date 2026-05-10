/**
 * Marketing CMS — pure type & constant definitions.
 *
 * This module is split out from `./content.ts` so Client Components can
 * import the type/constant identifiers without dragging the server-only
 * `getContent()` function (which transitively imports `next/headers`
 * via `lib/supabase/server.ts`) into the client bundle.
 *
 * Background: a Next.js 14 build failure ("You're importing a
 * component that needs next/headers …") was blocking every Production
 * deploy from Sprint 16.5 through Phase 17 because
 * `app/(app)/admin/content/content-editor.tsx` ('use client') imported
 * `ContentType` from `lib/marketing/content`. Even though only a
 * type was imported, Next's bundler resolved the module and choked on
 * its server-only top-of-file imports. Moving the constants here
 * makes the import safe.
 */

/** All marketing pages managed by the CMS. Keep in sync with admin UI. */
export const MARKETING_PAGES = [
  'home',
  'about',
  'features',
  'pricing',
  'scanning',
  'contact',
  'privacy',
  'terms',
  'blog',
  'brand',
] as const

export type MarketingPage = (typeof MARKETING_PAGES)[number]

export const CONTENT_TYPES = [
  'text',
  'rich_text',
  'image',
  'video',
  'embed',
  'link',
  'number',
  'json',
] as const

export type ContentType = (typeof CONTENT_TYPES)[number]
