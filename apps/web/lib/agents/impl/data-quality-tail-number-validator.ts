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

const N_NUMBER_RE = /^N([1-9][0-9]{0,3}[A-HJ-NP-Z]{0,2}|[1-9][0-9]{0,4})$/

export interface TailIssue {
  aircraft_id: string
  organization_id: string | null
  tail_number_raw: string
  reason: 'malformed' | 'empty' | 'too_long' | 'invalid_chars'
  suggested_fix: string | null
}

export interface TailValidatorReport {
  scanned: number
  invalid_count: number
  issues: TailIssue[]
}

function normalise(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s\-\.]/g, '')
    .replace(/^([^N])/, 'N$1') // if it starts with a digit and is plausibly a US tail, prepend N
}

export async function validateTailNumbers(args: {
  supabase: SupabaseClient
  organizationId?: string
}): Promise<{ ok: boolean; output?: TailValidatorReport; runId?: string; error?: string }> {
  return runAgent<TailValidatorReport>(
    'data-quality.tail-number-validator',
    {
      supabase: args.supabase,
      input: { organization_id_filter: args.organizationId ?? null },
    },
    async () => {
      let q = args.supabase
        .from('aircraft')
        .select('id, organization_id, tail_number')
        .limit(10000)
      if (args.organizationId) q = q.eq('organization_id', args.organizationId)
      const { data, error } = await q
      if (error) {
        return {
          output: { scanned: 0, invalid_count: 0, issues: [] },
          recommendation: { kind: 'tail_scan_failed', reason: error.message },
        }
      }
      type Row = { id: string; organization_id: string | null; tail_number: string | null }
      const rows = (data ?? []) as Row[]
      const issues: TailIssue[] = []
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
        if (N_NUMBER_RE.test(raw)) continue
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
        output: { scanned: rows.length, invalid_count: issues.length, issues },
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
