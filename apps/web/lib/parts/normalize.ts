// Query normalization + part-number extraction.

import type { SearchMode } from './types'

const PART_NUMBER_REGEX = /\b([A-Z0-9]{2,}[-/][A-Z0-9-]{2,}|[A-Z]{1,3}[0-9]{3,}[A-Z0-9-]*)\b/i

export function normalizeQuery(input: string): string {
  return input
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function classifySearchMode(query: string): SearchMode {
  const q = query.trim()
  // Short + alphanumeric with dashes = likely exact part
  if (q.length <= 40 && PART_NUMBER_REGEX.test(q)) {
    const m = q.match(PART_NUMBER_REGEX)
    if (m && m[0].length >= q.length * 0.5) return 'exact_part'
  }
  // Words like "oil filter for Cessna 172" = contextual
  if (/\b(for|fits|compatible|model|make)\b/i.test(q) && q.split(/\s+/).length >= 4) {
    return 'contextual'
  }
  // 1-3 words = keyword, 4+ words = general
  const wordCount = q.split(/\s+/).length
  return wordCount <= 3 ? 'keyword' : 'general'
}

export function extractPartNumber(text: string): string | null {
  const m = text.match(PART_NUMBER_REGEX)
  return m ? m[0].toUpperCase() : null
}

/** Strip garbage values like "Unknown" from aircraft context strings. */
function cleanContext(s: string | null | undefined): string | null {
  if (!s) return null
  // Remove "Unknown", "N/A", "None", "TBD" etc. that pollute search queries
  const cleaned = s
    .replace(/\b(unknown|n\/?a|none|tbd|unspecified|other)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length >= 2 ? cleaned : null
}

/** Build provider-ready query strings, with aircraft context if available. */
export function buildProviderQuery(
  query: string,
  opts: { aircraftMakeModel?: string | null; engineModel?: string | null; mode: SearchMode }
): string {
  const q = normalizeQuery(query)
  if (opts.mode === 'exact_part') return q

  const bits = [q]
  const acContext = cleanContext(opts.aircraftMakeModel)
  if (acContext) bits.push(acContext)
  const engContext = cleanContext(opts.engineModel)
  if (engContext) bits.push(engContext)

  // For keyword/general mode with no usable aircraft context, add "aircraft" so
  // Google Shopping returns aviation-relevant results instead of car parts.
  if ((opts.mode === 'keyword' || opts.mode === 'general') && bits.length === 1) {
    bits.push('aircraft')
  }

  return bits.join(' ')
}
