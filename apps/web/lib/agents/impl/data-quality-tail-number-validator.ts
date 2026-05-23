/**
 * data-quality.tail-number-validator
 *
 * Weekly sweep over public.aircraft. Checks every tail_number against
 * the FAA N-number format rules:
 *   - Starts with 'N'
 *   - 1–5 alphanumeric characters after the N
 *   - Letters limited to A–Z excluding I and O (FAA avoids those —
 *     they look like 1 and 0 on placards)
 *   - Cannot start with 0
 *   - Last 1–2 chars may be letters; the rest must be digits when
 *     letters are present (e.g. N123AB, N12345, N1ZZ are all valid;
 *     N12AB3 is not)
 *
 * Anything that doesn't fit is flagged as a data quality issue with a
 * suggested normalisation (uppercase, strip whitespace/dashes) if a
 * simple rewrite would make it valid. Pure SQL+regex — no LLM, no
 * external HTTP. The cross-check against the FAA Civil Aviation
 * Registry is a follow-on agent; this one catches the obvious
 * typos before they confuse RAG.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'
import { fetchFaaRegistry, type FaaRegistryRecord } from '@/lib/faa/registry-lookup'

const N_NUMBER_RE = /^N([1-9][0-9]{0,3}[A-HJ-NP-Z]{0,2}|[1-9][0-9]{0,4})$/

export interface TailIssue {
  aircraft_id: string
  organization_id: string | null
  tail_number_raw: string
  reason:
    | 'malformed'
    | 'empty'
    | 'too_long'
    | 'invalid_chars'
    | 'faa_mismatch'
    | 'faa_not_found'
  suggested_fix: string | null
  faa_record?: FaaRegistryRecord | null
  faa_mismatch_fields?: string[]
}

export interface TailValidatorReport {
  scanned: number
  invalid_count: number
  faa_checked: number
  issues: TailIssue[]
}

function normalise(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s\-\.]/g, '')
    .replace(/^([^N])/, 'N$1') // if it starts with a digit and is plausibly a US tail, prepend N
}

/**
 * Compare a validated tail's local row against the FAA registry record
 * we just fetched. Returns the list of mismatching fields (empty when
 * everything matches OR local data is null — null is a gap, not a
 * mismatch, and the year-backfiller will own that). Trims and case-
 * normalises before comparing so "cessna" ≈ "Cessna".
 */
function diffFaa(local: { make: string | null; model: string | null; year: number | null; serial_number: string | null }, faa: FaaRegistryRecord): string[] {
  const mismatches: string[] = []
  const norm = (s: string | null) => (s ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (local.make && faa.manufacturer && norm(local.make) !== norm(faa.manufacturer)) {
    mismatches.push(`make: "${local.make}" vs FAA "${faa.manufacturer}"`)
  }
  if (local.model && faa.model && norm(local.model) !== norm(faa.model)) {
    mismatches.push(`model: "${local.model}" vs FAA "${faa.model}"`)
  }
  if (local.year && faa.year && local.year !== faa.year) {
    mismatches.push(`year: ${local.year} vs FAA ${faa.year}`)
  }
  if (
    local.serial_number &&
    faa.serial_number &&
    norm(local.serial_number) !== norm(faa.serial_number)
  ) {
    mismatches.push(`serial: "${local.serial_number}" vs FAA "${faa.serial_number}"`)
  }
  return mismatches
}

export async function validateTailNumbers(args: {
  supabase: SupabaseClient
  organizationId?: string
  /**
   * When true, every well-formed tail is cross-checked against the
   * FAA Civil Aviation Registry via lib/faa/registry-lookup. Adds
   * 5s p99 latency per uncached tail; bounded to 30 lookups per run
   * to stay inside the cron 60s budget. The cache (faa_registry_cache,
   * 12h TTL) keeps repeat runs cheap.
   */
  enrichWithFaa?: boolean
  /** Cap for live FAA lookups per run. Defaults to 30. */
  faaLookupBudget?: number
}): Promise<{ ok: boolean; output?: TailValidatorReport; runId?: string; error?: string }> {
  const enrich = args.enrichWithFaa ?? false
  const budget = Math.max(0, Math.min(100, args.faaLookupBudget ?? 30))
  return runAgent<TailValidatorReport>(
    'data-quality.tail-number-validator',
    {
      supabase: args.supabase,
      input: {
        organization_id_filter: args.organizationId ?? null,
        enrich_with_faa: enrich,
        faa_lookup_budget: budget,
      },
    },
    async () => {
      let q = args.supabase
        .from('aircraft')
        .select('id, organization_id, tail_number, make, model, year, serial_number')
        .limit(10000)
      if (args.organizationId) q = q.eq('organization_id', args.organizationId)
      const { data, error } = await q
      if (error) {
        return {
          output: { scanned: 0, invalid_count: 0, faa_checked: 0, issues: [] },
          recommendation: { kind: 'tail_scan_failed', reason: error.message },
        }
      }
      type Row = {
        id: string
        organization_id: string | null
        tail_number: string | null
        make: string | null
        model: string | null
        year: number | null
        serial_number: string | null
      }
      const rows = (data ?? []) as Row[]
      const issues: TailIssue[] = []
      let faaChecked = 0
      let faaBudget = budget
      for (const r of rows) {
        const raw = (r.tail_number ?? '').trim()
        if (!raw) {
          issues.push({
            aircraft_id: r.id,
            organization_id: r.organization_id,
            tail_number_raw: '',
            reason: 'empty',
            suggested_fix: null,
          })
          continue
        }
        if (raw.length > 6) {
          issues.push({
            aircraft_id: r.id,
            organization_id: r.organization_id,
            tail_number_raw: raw,
            reason: 'too_long',
            suggested_fix: null,
          })
          continue
        }
        if (N_NUMBER_RE.test(raw)) {
          // Well-formed tail. Optionally cross-check against the FAA
          // registry to catch make/model/year/serial mismatches in our
          // own DB.
          if (enrich && faaBudget > 0) {
            faaBudget -= 1
            try {
              const lookup = await fetchFaaRegistry({
                supabase: args.supabase,
                tailNumber: raw,
              })
              if (lookup.ok && lookup.parsed) {
                faaChecked += 1
                const mismatches = diffFaa(
                  {
                    make: r.make,
                    model: r.model,
                    year: r.year,
                    serial_number: r.serial_number,
                  },
                  lookup.parsed,
                )
                if (mismatches.length > 0) {
                  issues.push({
                    aircraft_id: r.id,
                    organization_id: r.organization_id,
                    tail_number_raw: raw,
                    reason: 'faa_mismatch',
                    suggested_fix: null,
                    faa_record: lookup.parsed,
                    faa_mismatch_fields: mismatches,
                  })
                }
              } else if (lookup.status === 200) {
                // 200 with unparseable / empty payload → FAA returned no record
                issues.push({
                  aircraft_id: r.id,
                  organization_id: r.organization_id,
                  tail_number_raw: raw,
                  reason: 'faa_not_found',
                  suggested_fix: null,
                  faa_record: null,
                })
              }
            } catch (err) {
              // FAA helper already swallows most errors and returns ok=false
              // — re-catch defensively so a single bad lookup doesn't
              // poison the whole sweep
              console.warn(
                '[tail-validator] FAA lookup failed for',
                raw,
                (err as Error).message.slice(0, 120),
              )
            }
          }
          continue
        }
        // Try a simple rewrite.
        const fixed = normalise(raw)
        if (N_NUMBER_RE.test(fixed) && fixed !== raw) {
          issues.push({
            aircraft_id: r.id,
            organization_id: r.organization_id,
            tail_number_raw: raw,
            reason: 'malformed',
            suggested_fix: fixed,
          })
          continue
        }
        // Detect I/O misuse explicitly so the founder can spot OCR
        // mis-reads (typical: O → 0, I → 1)
        const hasBadLetter = /[IO]/.test(raw.toUpperCase())
        issues.push({
          aircraft_id: r.id,
          organization_id: r.organization_id,
          tail_number_raw: raw,
          reason: hasBadLetter ? 'invalid_chars' : 'malformed',
          suggested_fix: null,
        })
      }
      issues.sort((a, b) => a.reason.localeCompare(b.reason))
      return {
        output: {
          scanned: rows.length,
          invalid_count: issues.length,
          faa_checked: faaChecked,
          issues,
        },
        needsHuman: issues.length > 0,
        recommendation:
          issues.length > 0
            ? {
                kind: 'tail_number_issues',
                count: issues.length,
                issues: issues.slice(0, 50),
              }
            : null,
      }
    },
  )
}
