/**
 * Pure AD/SB classification + date-validation logic for the AD Traceability
 * module. Extracted from the route handler so it carries NO server
 * dependencies and can be unit-tested directly (see ad-classify.test.ts).
 *
 * The route's second LLM pass returns a loose array of objects; `coerceExtractedAd`
 * normalizes one row, `classifyAd` computes the rendered status + next-due date.
 */

export type AdType = 'one-time' | 'recurring'
export type AdStatus = 'complied' | 'recurring' | 'overdue' | 'no-evidence'

/** One structured AD extracted from the step-1 RAG answer. */
export interface ExtractedAd {
  ad_number: string
  type: AdType
  /** Whether the records document this AD as actually complied with. Decoupled
   *  from last_compliance_date so an AD documented as complied but without a
   *  legible year is still treated as complied (date "not recorded"). */
  complied: boolean
  last_compliance_date: string | null
  recurring_interval_months: number | null
  evidence_excerpt: string
}

/** The final shape rendered by the client. */
export interface TraceabilityAd {
  ad_number: string
  type: AdType
  last_compliance_date: string | null
  next_due: string | null
  evidence_excerpt: string
  status: AdStatus
}

/** Add a whole number of months to an ISO date, clamping day overflow. */
export function addMonths(isoDate: string, months: number): string | null {
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + months)
  // Clamp Feb-30 style overflow back to the last day of the target month.
  if (d.getUTCDate() < day) d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}

/**
 * True only for a strict "YYYY-MM-DD" calendar date with a real 4-digit year.
 * Rejects the model's "YYYY-06-20" placeholder (emitted when the year is not
 * documented) and impossible dates like "2001-02-30" — both of which
 * `new Date()` would otherwise coerce into a real-but-fabricated day.
 */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * Coerce one loose LLM row into a normalized ExtractedAd. Returns null when the
 * row has no usable AD number (the caller skips it). This is where the
 * date-validation + complied decoupling live:
 *   - a non-strict / placeholder date ("YYYY-06-20") becomes null
 *   - `complied` is true when the model says so OR a real date is present
 */
export function coerceExtractedAd(row: Record<string, unknown>): ExtractedAd | null {
  const adNumber = typeof row.ad_number === 'string' ? row.ad_number.trim() : ''
  if (!adNumber) return null

  const type: AdType = row.type === 'recurring' ? 'recurring' : 'one-time'

  // Accept ONLY a strict calendar date. The model's "YYYY-06-20" placeholder
  // (used when the year is unknown) and any malformed value become null, so we
  // never render or imply a compliance date that isn't in the records.
  const rawDate =
    typeof row.last_compliance_date === 'string' ? row.last_compliance_date.trim() : ''
  const lastDate = isValidIsoDate(rawDate) ? rawDate : null

  const intervalRaw = Number(row.recurring_interval_months)
  const interval =
    Number.isFinite(intervalRaw) && intervalRaw > 0 ? Math.round(intervalRaw) : null

  return {
    ad_number: adNumber,
    type,
    // A real compliance date is itself proof of compliance; otherwise trust the
    // model's explicit flag. Decouples "complied" from "has a parseable date" so
    // a documented-but-undated AD stays complied instead of flipping to "no
    // evidence".
    complied: row.complied === true || lastDate != null,
    last_compliance_date: lastDate,
    recurring_interval_months: interval,
    evidence_excerpt:
      typeof row.evidence_excerpt === 'string' ? row.evidence_excerpt.slice(0, 600) : '',
  }
}

/** Compute next_due + status for one extracted AD. */
export function classifyAd(ad: ExtractedAd): TraceabilityAd {
  let nextDue: string | null = null
  let status: AdStatus

  if (!ad.complied) {
    // No documented compliance — flagged for a manual records check.
    status = 'no-evidence'
  } else if (ad.type === 'recurring' && ad.last_compliance_date && ad.recurring_interval_months) {
    // Recurring, with a real date + interval → compute the next due date.
    nextDue = addMonths(ad.last_compliance_date, ad.recurring_interval_months)
    const isPast = nextDue != null && new Date(nextDue).getTime() < Date.now()
    status = isPast ? 'overdue' : 'recurring'
  } else {
    // Complied — one-time, or recurring without a parseable date/interval.
    // last_compliance_date may be null here (documented but no legible year);
    // the client shows "not recorded" rather than a fabricated date.
    status = ad.type === 'recurring' ? 'recurring' : 'complied'
  }

  return {
    ad_number: ad.ad_number,
    type: ad.type,
    last_compliance_date: ad.last_compliance_date,
    next_due: nextDue,
    evidence_excerpt: ad.evidence_excerpt,
    status,
  }
}
