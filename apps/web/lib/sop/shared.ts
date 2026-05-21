/**
 * Client-safe SOP utilities — types + pure functions with NO node imports.
 *
 * Critical: this file is the only thing client components (the Cmd+K
 * palette, the search-result renderer) should import from `lib/sop/*`.
 * Importing anything that touches `lib/sop/parser.ts` from a client
 * component pulls `node:fs` / `node:path` into the client bundle and
 * blows up the Next.js webpack build with "Reading from 'node:fs' is
 * not handled by plugins."
 *
 * The split:
 *   parser.ts        server-only — fs/path/yaml reads from disk
 *   shared.ts        ← THIS FILE — types + slugify; client-safe
 *   search.ts        index builder + matcher; client-safe (imports shared.ts)
 */

export interface SopFrontmatter {
  title: string
  module: string
  slug: string
  order: number
  faa_refs: string[]
  version: string
  last_updated: string
  status: 'active' | 'draft' | 'deprecated'
}

export interface SopRecord {
  slug: string
  frontmatter: SopFrontmatter
  /** Raw markdown body (no frontmatter). */
  body: string
  /** First 200 chars of the body, stripped of markdown syntax — for cards. */
  excerpt: string
}

/**
 * Section — one H2-bounded chunk of an SOP. The reader uses this to show
 * one section at a time. Lives here (not in parser.ts) so client
 * components can import the type without dragging node:fs into the bundle.
 */
export interface SopSection {
  /** Stable anchor id; matches the H2's slugify. 'overview' for the prelude. */
  id: string
  /** Human-readable title. */
  title: string
  /** 1-based ordinal — useful for "Section 3 of 12" display. */
  index: number
  /** Rendered HTML for just this section. */
  html: string
  /** Raw markdown for this section. */
  body: string
  /** Whether this section contains a mermaid block. */
  hasMermaid: boolean
}

/**
 * Turn a string into a kebab-case slug suitable for an HTML anchor id.
 * Pure, client-safe.
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
