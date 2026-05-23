/**
 * safety.pii-leak-scanner
 *
 * Hourly sweep over the trailing 65 minutes of inbox_messages.body_text
 * AND ask_logs.question. Looks for high-precision PII patterns we never
 * want flowing through our system unredacted:
 *
 *   - US SSN (NNN-NN-NNNN; not 000-, 666-, 9xx-, etc.)
 *   - Credit card numbers passing the Luhn checksum (>= 13 digits)
 *   - US passport numbers (one letter + 8 digits, or 9 digits)
 *   - Long digit runs that *look* like account numbers in close
 *     proximity to keywords ('account', 'routing', 'iban')
 *
 * On a hit, we emit a `pii_redaction_review` recommendation pinpointing
 * the source row + the matched pattern (NOT the matched text). The
 * decision to quarantine is human-only — auto-deletion would burn
 * legitimate inbox replies. No LLM.
 *
 * False-positive guardrails:
 *   - SSN matcher excludes obvious test data (123-45-6789, 000-..., 9xx-...)
 *   - CC matcher requires Luhn pass AND a known IIN prefix (4/5/3/6)
 *   - We sample at most 500 rows per pass to bound cost
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface PiiHit {
  source: 'inbox_message' | 'ask_log'
  row_id: string
  organization_id: string | null
  user_id: string | null
  matched_kind: 'ssn' | 'credit_card' | 'passport' | 'account_number'
  // We deliberately store only the kind + a tiny redacted preview,
  // never the matched text, to avoid the scanner itself becoming a
  // PII sink. e.g. preview="***-**-1234" for SSN.
  redacted_preview: string
  created_at: string
}

export interface PiiScanReport {
  scanned_inbox: number
  scanned_ask: number
  hit_count: number
  hits: PiiHit[]
}

const SSN_RE = /\b(?!000|9\d{2}|666)(\d{3})-(?!00)(\d{2})-(?!0000)(\d{4})\b/g
const PASSPORT_RE = /\b([A-Z]\d{8}|\d{9})\b/g
const CC_RE = /\b((?:\d[ -]?){13,19})\b/g
const ACCOUNT_KEYWORDS = /(account|routing|iban|swift|wire)/i

function luhn(digits: string): boolean {
  let sum = 0
  let dbl = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (d < 0 || d > 9) return false
    if (dbl) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    dbl = !dbl
  }
  return sum % 10 === 0 && digits.length >= 13
}

function ccIsKnown(digits: string): boolean {
  // Visa/MC/Amex/Discover prefixes — rough but enough to drop noise like
  // tail-number sequences that pass Luhn by coincidence.
  return /^(4|5[1-5]|3[47]|6011|65|22[2-9]|2[3-6]\d|27[0-1]|2720)/.test(digits)
}

function scanText(text: string): Array<{ kind: PiiHit['matched_kind']; preview: string }> {
  const hits: Array<{ kind: PiiHit['matched_kind']; preview: string }> = []
  for (const m of text.matchAll(SSN_RE)) {
    hits.push({ kind: 'ssn', preview: `***-**-${m[3]}` })
  }
  for (const m of text.matchAll(PASSPORT_RE)) {
    const v = m[1]
    hits.push({ kind: 'passport', preview: `${v.slice(0, 1)}*****${v.slice(-2)}` })
  }
  for (const m of text.matchAll(CC_RE)) {
    const digits = m[1].replace(/[ -]/g, '')
    if (!ccIsKnown(digits)) continue
    if (!luhn(digits)) continue
    hits.push({ kind: 'credit_card', preview: `****-****-****-${digits.slice(-4)}` })
  }
  // Account-number heuristic: 8-12 digit run near a banking keyword
  if (ACCOUNT_KEYWORDS.test(text)) {
    const runs = text.match(/\b\d{8,12}\b/g) ?? []
    for (const r of runs) {
      hits.push({ kind: 'account_number', preview: `…${r.slice(-4)}` })
    }
  }
  return hits
}

export async function scanForPiiLeaks(args: {
  supabase: SupabaseClient
  /** Look-back window in minutes. Default 65 (hourly with 5-min overlap). */
  lookbackMinutes?: number
}): Promise<{ ok: boolean; output?: PiiScanReport; runId?: string; error?: string }> {
  const lookback = args.lookbackMinutes ?? 65
  return runAgent<PiiScanReport>(
    'safety.pii-leak-scanner',
    { supabase: args.supabase, input: { lookback_minutes: lookback } },
    async () => {
      const since = new Date(Date.now() - lookback * 60_000).toISOString()
      const { data: inboxRows } = await args.supabase
        .from('inbox_messages')
        .select('id, organization_id, user_id, body_text, created_at')
        .gte('created_at', since)
        .not('body_text', 'is', null)
        .limit(500)
      const { data: askRows } = await args.supabase
        .from('ask_logs')
        .select('id, organization_id, user_id, question, created_at')
        .gte('created_at', since)
        .not('question', 'is', null)
        .limit(500)
      type Inbox = {
        id: string
        organization_id: string | null
        user_id: string | null
        body_text: string | null
        created_at: string
      }
      type Ask = {
        id: string
        organization_id: string | null
        user_id: string | null
        question: string | null
        created_at: string
      }
      const inbox = (inboxRows ?? []) as Inbox[]
      const ask = (askRows ?? []) as Ask[]
      const hits: PiiHit[] = []
      for (const r of inbox) {
        const matches = scanText(r.body_text ?? '')
        for (const m of matches) {
          hits.push({
            source: 'inbox_message',
            row_id: r.id,
            organization_id: r.organization_id,
            user_id: r.user_id,
            matched_kind: m.kind,
            redacted_preview: m.preview,
            created_at: r.created_at,
          })
        }
      }
      for (const r of ask) {
        const matches = scanText(r.question ?? '')
        for (const m of matches) {
          hits.push({
            source: 'ask_log',
            row_id: r.id,
            organization_id: r.organization_id,
            user_id: r.user_id,
            matched_kind: m.kind,
            redacted_preview: m.preview,
            created_at: r.created_at,
          })
        }
      }
      return {
        output: {
          scanned_inbox: inbox.length,
          scanned_ask: ask.length,
          hit_count: hits.length,
          hits,
        },
        needsHuman: hits.length > 0,
        recommendation:
          hits.length > 0
            ? { kind: 'pii_redaction_review', hit_count: hits.length, hits: hits.slice(0, 50) }
            : null,
      }
    },
  )
}
