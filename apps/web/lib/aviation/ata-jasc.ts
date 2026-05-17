/**
 * ATA / JASC taxonomy — shared client helper.
 *
 * The taxonomy itself lives in the `ata_chapters` / `jasc_codes` tables
 * (migration 120 + the 2026-05-16 seed migration). This module is the thin
 * typed client used by the AtaJascSelector and the forms it is wired into:
 *
 *   - searchAtaJasc()      → GET  /api/taxonomy/search          (code or text search)
 *   - suggestAtaJasc()     → POST /api/aviation/suggest-ata-jasc (AI auto-suggest)
 *   - formatAtaJascLabel() → human-readable display string
 *
 * The selector works fully offline of any third-party API — search hits the
 * app's own taxonomy tables. The AI suggest endpoint is an optional
 * enhancement; callers must treat a null result as "no suggestion".
 */

/** A single JASC row as returned by /api/taxonomy/search (decorated). */
export interface AtaJascResult {
  jasc_code: string
  ata_code: string
  title: string // JASC title
  ata_title: string | null
  definition?: string | null
  /** "JASC 7110 — Reciprocating Engine" */
  label: string
  /** "ATA 71 — Power Plant" */
  secondary_label: string
  system_level?: boolean
}

/** A selected ATA/JASC classification, as persisted on a record. */
export interface AtaJascValue {
  ata_code: string | null
  ata_description: string | null
  jasc_code: string | null
  jasc_description: string | null
}

export type AtaJascConfidence = 'high' | 'medium' | 'low'

export interface AtaJascSuggestion extends AtaJascValue {
  confidence: AtaJascConfidence
  rationale?: string
}

export const EMPTY_ATA_JASC: AtaJascValue = {
  ata_code: null,
  ata_description: null,
  jasc_code: null,
  jasc_description: null,
}

/** Convert a search result row into a persistable AtaJascValue. */
export function ataJascFromResult(r: AtaJascResult): AtaJascValue {
  return {
    ata_code: r.ata_code ?? null,
    ata_description: r.ata_title ?? null,
    jasc_code: r.jasc_code ?? null,
    jasc_description: r.title ?? null,
  }
}

export function hasAtaJasc(v: AtaJascValue | null | undefined): boolean {
  return !!(v && (v.ata_code || v.jasc_code))
}

/** "ATA 71 — Power Plant · JASC 7110 — Reciprocating Engine" */
export function formatAtaJascLabel(v: AtaJascValue | null | undefined): string {
  if (!v) return ''
  const parts: string[] = []
  if (v.ata_code) {
    parts.push(`ATA ${v.ata_code}${v.ata_description ? ` — ${v.ata_description}` : ''}`)
  }
  if (v.jasc_code) {
    parts.push(`JASC ${v.jasc_code}${v.jasc_description ? ` — ${v.jasc_description}` : ''}`)
  }
  return parts.join(' · ')
}

/** Short form for table cells: "71 / 7110" or "—". */
export function shortAtaJasc(v: AtaJascValue | null | undefined): string {
  if (!v || (!v.ata_code && !v.jasc_code)) return '—'
  return [v.ata_code, v.jasc_code].filter(Boolean).join(' / ')
}

/**
 * Search the taxonomy by code number OR description text.
 * Returns [] on any error so callers can render an empty list safely.
 */
export async function searchAtaJasc(
  query: string,
  opts: { aircraftId?: string | null; limit?: number; signal?: AbortSignal } = {},
): Promise<AtaJascResult[]> {
  try {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (opts.aircraftId) params.set('aircraft_id', opts.aircraftId)
    params.set('limit', String(opts.limit ?? 25))
    const res = await fetch(`/api/taxonomy/search?${params.toString()}`, { signal: opts.signal })
    if (!res.ok) return []
    const json = await res.json().catch(() => null)
    return Array.isArray(json?.results) ? (json.results as AtaJascResult[]) : []
  } catch {
    return []
  }
}

/**
 * Ask the AI to classify a free-text description into the best ATA/JASC code.
 * Returns null if the endpoint is unavailable or has no confident match —
 * the selector must remain fully usable without it.
 */
export async function suggestAtaJasc(
  description: string,
  context?: string,
): Promise<AtaJascSuggestion | null> {
  try {
    const res = await fetch('/api/aviation/suggest-ata-jasc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, context }),
    })
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    if (!json || (!json.ata_code && !json.jasc_code)) return null
    const confidence: AtaJascConfidence =
      json.confidence === 'high' || json.confidence === 'low' ? json.confidence : 'medium'
    return {
      ata_code: json.ata_code ?? null,
      ata_description: json.ata_description ?? null,
      jasc_code: json.jasc_code ?? null,
      jasc_description: json.jasc_description ?? null,
      confidence,
      rationale: typeof json.rationale === 'string' ? json.rationale : undefined,
    }
  } catch {
    return null
  }
}
