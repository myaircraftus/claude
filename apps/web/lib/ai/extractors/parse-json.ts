/**
 * Parse JSON out of Claude's text response (Spec 7.3 helper).
 *
 * The extractor system prompts demand pure JSON output, but Claude
 * sometimes wraps in ```json fences or appends a stray closing line.
 * This helper finds the first balanced { … } block and parses it.
 * Returns null on failure so callers can decide retry vs fallback.
 */

export function extractJsonObject(text: string): unknown | null {
  if (!text) return null
  // Fast path — already pure JSON.
  try { return JSON.parse(text) } catch { /* fall through */ }

  // Strip ```json … ``` fences, then find the outer braces.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) {
    try { return JSON.parse(fenced[1]) } catch { /* keep going */ }
  }

  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escape) { escape = false; continue }
    if (c === '\\') { escape = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        const candidate = text.slice(start, i + 1)
        try { return JSON.parse(candidate) } catch { return null }
      }
    }
  }
  return null
}
