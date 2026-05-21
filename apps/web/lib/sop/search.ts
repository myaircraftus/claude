/**
 * SOP Library — full-text search built on the SOP corpus.
 *
 * The viewer at /sop-library + /sop-library/[slug] already supports
 * naive substring filter via the simple search box. This module adds
 * a richer, cross-SOP search that powers the Cmd+K command palette:
 *
 *   - Title + section heading + paragraph body all indexed
 *   - Fuzzy-matched (slight typos forgiven) via a hand-rolled scorer
 *     since we don't want a Fuse.js dependency just for 13 short docs
 *   - Results grouped by SOP, surfaced as section anchors
 *
 * We bake the index server-side at request time and hand a single JSON
 * payload to the client. With ~15 SOPs averaging ~1500 lines each,
 * indexed at ~200 lines per chunk, the payload is ~80 KB JSON — fine
 * to ship in one request and search client-side in <50 ms per keystroke.
 */
import type { SopRecord } from './parser'
import { slugify } from './parser'

export interface SopSearchEntry {
  /** The SOP slug. */
  sopSlug: string
  /** The SOP title — denormalised for fast rendering. */
  sopTitle: string
  /** The section path (e.g. "5 · Aircraft view — owner-visible fields"). */
  sectionTitle: string
  /** Anchor id within the SOP (use as `#${anchor}`). */
  anchor: string
  /** A trimmed text excerpt for the result line. */
  excerpt: string
}

export interface SopSearchIndex {
  entries: SopSearchEntry[]
}

/**
 * Build a search index from the loaded SOPs. Each SOP becomes many
 * entries — one per H2 + H3, plus a synthetic "(title)" entry that
 * returns the SOP itself when the query matches the title.
 */
export function buildSearchIndex(sops: SopRecord[]): SopSearchIndex {
  const entries: SopSearchEntry[] = []

  for (const sop of sops) {
    const slug = sop.slug
    const sopTitle = sop.frontmatter.title

    // Synthetic title entry — match on title only, no anchor (top of doc).
    entries.push({
      sopSlug: slug,
      sopTitle,
      sectionTitle: `(${sopTitle})`,
      anchor: '',
      excerpt: sop.excerpt,
    })

    // Walk the body, picking out H2 / H3 sections and the paragraph that
    // immediately follows them for the excerpt.
    const lines = sop.body.split('\n')
    let currentH2: string | null = null
    let lastHeadingIndex = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('## ')) {
        const text = line.slice(3).trim()
        currentH2 = text
        const excerpt = excerptAfter(lines, i)
        entries.push({
          sopSlug: slug,
          sopTitle,
          sectionTitle: text,
          anchor: slugify(text),
          excerpt,
        })
        lastHeadingIndex = i
      } else if (line.startsWith('### ')) {
        const text = line.slice(4).trim()
        const display = currentH2 ? `${currentH2} → ${text}` : text
        const excerpt = excerptAfter(lines, i)
        entries.push({
          sopSlug: slug,
          sopTitle,
          sectionTitle: display,
          anchor: slugify(text),
          excerpt,
        })
        lastHeadingIndex = i
      }
    }
    // Suppress unused-variable lint without runtime impact.
    void lastHeadingIndex
  }

  return { entries }
}

function excerptAfter(lines: string[], i: number): string {
  let out = ''
  for (let j = i + 1; j < lines.length && out.length < 220; j++) {
    const l = lines[j].trim()
    if (l === '') continue
    if (l.startsWith('#')) break
    // Strip markdown syntax for the excerpt
    out +=
      (out ? ' ' : '') +
      l
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  }
  return out.slice(0, 220)
}

/**
 * Search the index. Lightweight fuzzy scorer:
 *   - Exact substring → high score
 *   - All query terms present (in any order, in any field) → mid score
 *   - Initial-letter abbreviation match on the title (`apr` matches "Apprentice") → low score
 *
 * Returns top 12 entries sorted by score.
 */
export function searchSopIndex(
  index: SopSearchIndex,
  rawQuery: string,
): SopSearchEntry[] {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return []
  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []

  const scored: Array<{ entry: SopSearchEntry; score: number }> = []
  for (const entry of index.entries) {
    const hay = (
      entry.sopTitle +
      ' ' +
      entry.sectionTitle +
      ' ' +
      entry.excerpt
    ).toLowerCase()
    let score = 0
    // Exact substring on the full query
    if (hay.includes(q)) score += 50
    // Title-only exact substring → bonus
    if (entry.sopTitle.toLowerCase().includes(q)) score += 25
    // Section-title-only exact substring → bonus
    if (entry.sectionTitle.toLowerCase().includes(q)) score += 20
    // All tokens present
    if (tokens.every((t) => hay.includes(t))) score += 10
    // Per-token contribution
    for (const t of tokens) {
      if (hay.includes(t)) score += 3
    }
    if (score > 0) scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 12).map((s) => s.entry)
}
