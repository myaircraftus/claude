import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isValidIsoDate,
  addMonths,
  coerceExtractedAd,
  classifyAd,
  type ExtractedAd,
} from './ad-classify'

// ─── isValidIsoDate — the guard that kills the fabricated-date bug ───────────
describe('isValidIsoDate', () => {
  it('accepts a real calendar date', () => {
    expect(isValidIsoDate('1996-10-21')).toBe(true)
    expect(isValidIsoDate('2020-02-29')).toBe(true) // leap year
  })

  it('rejects the "YYYY-06-20" placeholder that caused the bug', () => {
    expect(isValidIsoDate('YYYY-06-20')).toBe(false)
  })

  it('rejects impossible calendar dates', () => {
    expect(isValidIsoDate('2001-02-30')).toBe(false) // Feb 30
    expect(isValidIsoDate('2001-02-29')).toBe(false) // not a leap year
    expect(isValidIsoDate('2001-13-01')).toBe(false) // month 13
    expect(isValidIsoDate('2001-00-10')).toBe(false) // month 0
    expect(isValidIsoDate('2001-06-31')).toBe(false) // June has 30 days
    expect(isValidIsoDate('2001-06-00')).toBe(false) // day 0
  })

  it('rejects non-strict / malformed formats', () => {
    expect(isValidIsoDate('2001-6-1')).toBe(false) // not zero-padded
    expect(isValidIsoDate('2001/06/20')).toBe(false) // wrong separators
    expect(isValidIsoDate('2001-06-20T00:00:00')).toBe(false) // has time
    expect(isValidIsoDate(' 2001-06-20')).toBe(false) // leading space
    expect(isValidIsoDate('20-06-20')).toBe(false) // 2-digit year
    expect(isValidIsoDate('')).toBe(false)
    expect(isValidIsoDate('June 20')).toBe(false)
  })
})

// ─── addMonths — recurring next-due math ─────────────────────────────────────
describe('addMonths', () => {
  it('adds whole months', () => {
    expect(addMonths('2020-01-15', 12)).toBe('2021-01-15')
    expect(addMonths('2020-01-15', 6)).toBe('2020-07-15')
  })

  it('clamps end-of-month overflow', () => {
    expect(addMonths('2021-01-31', 1)).toBe('2021-02-28') // Feb, non-leap
    expect(addMonths('2020-01-31', 1)).toBe('2020-02-29') // Feb, leap
    expect(addMonths('2021-03-31', 1)).toBe('2021-04-30') // April has 30
  })

  it('returns null for an unparseable input', () => {
    expect(addMonths('not-a-date', 12)).toBeNull()
  })
})

// ─── coerceExtractedAd — normalizing one loose LLM row ───────────────────────
describe('coerceExtractedAd', () => {
  it('returns null when there is no usable AD number', () => {
    expect(coerceExtractedAd({})).toBeNull()
    expect(coerceExtractedAd({ ad_number: '   ' })).toBeNull()
    expect(coerceExtractedAd({ ad_number: 123 })).toBeNull()
  })

  it('nulls a placeholder / malformed date instead of keeping it', () => {
    const ad = coerceExtractedAd({ ad_number: '84-26-02', last_compliance_date: 'YYYY-06-20' })
    expect(ad?.last_compliance_date).toBeNull()
  })

  it('keeps a real date and treats it as proof of compliance', () => {
    const ad = coerceExtractedAd({ ad_number: '93-2066', last_compliance_date: '1996-10-21' })
    expect(ad?.last_compliance_date).toBe('1996-10-21')
    expect(ad?.complied).toBe(true) // date present ⇒ complied even without the flag
  })

  it('honors an explicit complied flag when there is no legible date', () => {
    expect(coerceExtractedAd({ ad_number: 'x', complied: true })?.complied).toBe(true)
    expect(coerceExtractedAd({ ad_number: 'x', complied: false })?.complied).toBe(false)
    expect(coerceExtractedAd({ ad_number: 'x' })?.complied).toBe(false) // absent ⇒ false
    // only a strict boolean true counts (not a truthy string)
    expect(coerceExtractedAd({ ad_number: 'x', complied: 'yes' })?.complied).toBe(false)
  })

  it('coerces recurring interval sanely', () => {
    expect(coerceExtractedAd({ ad_number: 'x', recurring_interval_months: '12' })?.recurring_interval_months).toBe(12)
    expect(coerceExtractedAd({ ad_number: 'x', recurring_interval_months: 12.7 })?.recurring_interval_months).toBe(13)
    expect(coerceExtractedAd({ ad_number: 'x', recurring_interval_months: 0 })?.recurring_interval_months).toBeNull()
    expect(coerceExtractedAd({ ad_number: 'x', recurring_interval_months: -3 })?.recurring_interval_months).toBeNull()
    expect(coerceExtractedAd({ ad_number: 'x', recurring_interval_months: 'abc' })?.recurring_interval_months).toBeNull()
  })

  it('maps type and truncates evidence', () => {
    expect(coerceExtractedAd({ ad_number: 'x', type: 'recurring' })?.type).toBe('recurring')
    expect(coerceExtractedAd({ ad_number: 'x', type: 'weird' })?.type).toBe('one-time')
    expect(coerceExtractedAd({ ad_number: 'x' })?.type).toBe('one-time')
    const long = 'a'.repeat(1000)
    expect(coerceExtractedAd({ ad_number: 'x', evidence_excerpt: long })?.evidence_excerpt).toHaveLength(600)
    expect(coerceExtractedAd({ ad_number: 'x', evidence_excerpt: 42 })?.evidence_excerpt).toBe('')
  })
})

// ─── classifyAd — status + next-due, the heart of the report ─────────────────
describe('classifyAd', () => {
  const base: ExtractedAd = {
    ad_number: 'AD-1',
    type: 'one-time',
    complied: true,
    last_compliance_date: null,
    recurring_interval_months: null,
    evidence_excerpt: '',
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-02T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('one-time complied WITH a date → complied, no next-due, date preserved', () => {
    const r = classifyAd({ ...base, last_compliance_date: '1996-10-21' })
    expect(r.status).toBe('complied')
    expect(r.last_compliance_date).toBe('1996-10-21')
    expect(r.next_due).toBeNull()
  })

  it('one-time complied WITHOUT a date → still complied (the "Not recorded" case), no fabricated date', () => {
    const r = classifyAd({ ...base, last_compliance_date: null })
    expect(r.status).toBe('complied')
    expect(r.last_compliance_date).toBeNull()
  })

  it('not complied → no-evidence', () => {
    expect(classifyAd({ ...base, complied: false }).status).toBe('no-evidence')
    expect(classifyAd({ ...base, type: 'recurring', complied: false }).status).toBe('no-evidence')
  })

  it('recurring with a date + interval computes next-due and flags overdue', () => {
    const overdue = classifyAd({
      ...base,
      type: 'recurring',
      last_compliance_date: '2024-01-01',
      recurring_interval_months: 12,
    })
    expect(overdue.next_due).toBe('2025-01-01')
    expect(overdue.status).toBe('overdue') // 2025-01-01 < 2026-07-02

    const current = classifyAd({
      ...base,
      type: 'recurring',
      last_compliance_date: '2026-06-01',
      recurring_interval_months: 12,
    })
    expect(current.next_due).toBe('2027-06-01')
    expect(current.status).toBe('recurring') // future ⇒ not overdue
  })

  it('recurring complied but missing a date/interval → recurring, no next-due (no "due —")', () => {
    expect(classifyAd({ ...base, type: 'recurring' }).status).toBe('recurring')
    expect(classifyAd({ ...base, type: 'recurring' }).next_due).toBeNull()
    expect(
      classifyAd({ ...base, type: 'recurring', last_compliance_date: '2020-01-01' }).next_due,
    ).toBeNull() // date but no interval
  })
})
