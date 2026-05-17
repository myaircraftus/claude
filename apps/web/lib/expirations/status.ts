/**
 * Expiration status — shared across every /expirations page.
 *
 *   Expired       — expiration date is in the past
 *   Expiring Soon — expiration date is within EXPIRING_SOON_DAYS (30)
 *   Valid         — expiration date is further out
 *   No Date       — no expiration date recorded
 */

export type ExpirationStatus = 'expired' | 'expiring-soon' | 'valid' | 'no-date'

export const EXPIRING_SOON_DAYS = 30

/** Days from today until `date` (negative = past). null if no/invalid date. */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null
  const exp = new Date(`${String(date).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(exp.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000)
}

export function expirationStatus(
  date: string | null | undefined,
  soonDays = EXPIRING_SOON_DAYS,
): ExpirationStatus {
  const days = daysUntil(date)
  if (days === null) return 'no-date'
  if (days < 0) return 'expired'
  if (days <= soonDays) return 'expiring-soon'
  return 'valid'
}

export interface ExpirationMeta {
  label: string
  badge: string
  /** Tailwind classes for a bordered status pill. */
  cls: string
  /** Tailwind text color only. */
  text: string
}

export const EXPIRATION_META: Record<ExpirationStatus, ExpirationMeta> = {
  expired: {
    label: 'Expired',
    badge: '⚠ Expired',
    cls: 'bg-red-100 text-red-800 border-red-300',
    text: 'text-red-700',
  },
  'expiring-soon': {
    label: 'Expiring Soon',
    badge: '! Expiring Soon',
    cls: 'bg-amber-100 text-amber-800 border-amber-300',
    text: 'text-amber-700',
  },
  valid: {
    label: 'Valid',
    badge: '✓ Valid',
    cls: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    text: 'text-emerald-700',
  },
  'no-date': {
    label: 'No Date',
    badge: 'No Expiry',
    cls: 'bg-slate-100 text-slate-700 border-slate-300',
    text: 'text-slate-600',
  },
}

/** Status filter tabs shared by every expiration list. */
export const EXPIRATION_TABS = [
  { key: 'all', label: 'All' },
  { key: 'expired', label: 'Expired' },
  { key: 'expiring-soon', label: 'Expiring Soon' },
  { key: 'valid', label: 'Valid' },
] as const

export type ExpirationTabKey = (typeof EXPIRATION_TABS)[number]['key']

/** "03/14/2026" from an ISO-ish date string. */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d))
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '—'
}

/** "in 12 days" / "5 days ago" / "today". */
export function relativeDue(date: string | null | undefined): string {
  const days = daysUntil(date)
  if (days === null) return ''
  if (days === 0) return 'today'
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`
  const past = Math.abs(days)
  return `${past} day${past === 1 ? '' : 's'} ago`
}
