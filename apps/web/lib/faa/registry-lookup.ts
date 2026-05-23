/**
 * FAA Civil Aviation Registry HTTP cross-check helper.
 *
 * The FAA exposes per-aircraft inquiry pages at
 *   https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?nNumberTxt=<num>
 *
 * For per-tail lookups we use that HTML page — lowest-friction, no
 * credentials required. We throttle to one request at a time per
 * Vercel instance and cache results for 12h in `faa_registry_cache`.
 *
 * The HTML parser is conservative: it only extracts labelled-table
 * fields (Serial Number, Manufacturer Name, Model, Year Mfr, etc.).
 * If the HTML changes shape, we degrade to { ok: false, parsed: null }
 * rather than throwing — the calling agent records a
 * `faa_lookup_failed` recommendation.
 *
 * This module is import-safe from any server route. It DOES NOT call
 * out by itself — callers invoke `fetchFaaRegistry` explicitly.
 *
 * Used by (planned follow-on agents):
 *   - data-quality.tail-number-validator (live FAA cross-check)
 *   - data-quality.aircraft-year-backfiller (replace serial heuristic)
 *   - safety.faa-bulletin-watcher (open AD list per tail)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeTailNumber } from './registry'

export interface FaaRegistryRecord {
  n_number: string
  serial_number: string | null
  manufacturer: string | null
  model: string | null
  year: number | null
  airworthiness_class: string | null
  certificate_issue_date: string | null
  raw_html_excerpt: string | null
}

export interface FaaRegistryLookup {
  ok: boolean
  cached: boolean
  status: number | null
  parsed: FaaRegistryRecord | null
  error: string | null
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 5_000
const USER_AGENT = 'myaircraft-registry-lookup/1 (+https://myaircraft.us)'

/**
 * Parse the FAA inquiry HTML page. Tolerant to small label variations
 * but bails out if it can't find any of the core fields.
 */
function parseFaaHtml(tail: string, html: string): FaaRegistryRecord | null {
  const pick = (label: string): string | null => {
    const re = new RegExp(
      `<td[^>]*>\\s*${label}\\s*</td>\\s*<td[^>]*>\\s*([\\s\\S]*?)</td>`,
      'i',
    )
    const m = re.exec(html)
    if (!m) return null
    const text = m[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text.length > 0 ? text : null
  }

  const serial = pick('Serial Number')
  const manufacturer = pick('Manufacturer Name') ?? pick('Mfr Name')
  const model = pick('Model')
  const yearRaw = pick('Year Mfr') ?? pick('Year Manufactured')
  const airworth = pick('Airworthiness Classification') ?? pick('Class')
  const certDate = pick('Certificate Issue Date') ?? pick('Cert Issue Date')

  if (!serial && !manufacturer && !model && !yearRaw) {
    return null
  }
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? parseInt(yearRaw, 10) : null
  return {
    n_number: tail,
    serial_number: serial,
    manufacturer,
    model,
    year,
    airworthiness_class: airworth,
    certificate_issue_date: certDate,
    raw_html_excerpt: html.slice(0, 1000),
  }
}

/**
 * Cache-aware FAA registry lookup. Reads `faa_registry_cache` first;
 * on cache miss (or expired) fetches the inquiry page, parses, and
 * upserts. The cache table is optional — if it doesn't exist we
 * silently fall back to a direct fetch with no caching.
 */
export async function fetchFaaRegistry(args: {
  supabase: SupabaseClient
  tailNumber: string
  forceRefresh?: boolean
}): Promise<FaaRegistryLookup> {
  const normalized = normalizeTailNumber(args.tailNumber)
  if (!normalized) {
    return { ok: false, cached: false, status: null, parsed: null, error: 'invalid tail' }
  }
  const tail = normalized.normalized

  // 1) Cache read
  if (!args.forceRefresh) {
    try {
      const { data } = await args.supabase
        .from('faa_registry_cache')
        .select('n_number, parsed, fetched_at')
        .eq('n_number', tail)
        .maybeSingle()
      type Row = { n_number: string; parsed: unknown; fetched_at: string | null }
      const row = data as Row | null
      if (row && row.parsed && row.fetched_at) {
        const ageMs = Date.now() - Date.parse(row.fetched_at)
        if (ageMs < CACHE_TTL_MS) {
          return {
            ok: true,
            cached: true,
            status: 200,
            parsed: row.parsed as FaaRegistryRecord,
            error: null,
          }
        }
      }
    } catch {
      // Cache table missing — fall through to direct fetch.
    }
  }

  // 2) Live fetch
  const url = `https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?nNumberTxt=${encodeURIComponent(normalized.registryKey)}`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    return {
      ok: false,
      cached: false,
      status: null,
      parsed: null,
      error: (err as Error).message.slice(0, 200),
    }
  }
  if (!res.ok) {
    return {
      ok: false,
      cached: false,
      status: res.status,
      parsed: null,
      error: `FAA registry returned HTTP ${res.status}`,
    }
  }
  const html = await res.text()
  const parsed = parseFaaHtml(tail, html)
  if (!parsed) {
    return {
      ok: false,
      cached: false,
      status: res.status,
      parsed: null,
      error: 'FAA registry page could not be parsed',
    }
  }

  // 3) Cache upsert (best-effort)
  try {
    await args.supabase
      .from('faa_registry_cache')
      .upsert(
        {
          n_number: tail,
          parsed: parsed as unknown as Record<string, unknown>,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'n_number' },
      )
  } catch {
    // Table missing — that's fine.
  }

  return { ok: true, cached: false, status: res.status, parsed, error: null }
}
