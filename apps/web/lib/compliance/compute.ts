/**
 * Compliance compute (Spec 1.2).
 *
 * Pure helpers — no DB calls. Given a ComplianceItem + the aircraft's
 * current Hobbs/Cycles, derive next_due_* and status. The server-side
 * recomputeCompliance() (lib/compliance/recompute.ts) handles I/O.
 *
 * Whichever-comes-first: an item with multiple intervals (e.g. annual at
 * 12 calendar months OR 100 hours) is overdue when ANY interval is past;
 * due-soon when ANY is inside the lookahead window.
 */

import type { ComplianceItem, ComplianceStatus } from '@/types'

const MS_PER_DAY = 86_400_000

/**
 * Default look-ahead windows — items inside these become 'due-soon'.
 * Tuned for the 30/14/7-day reminder cadence (Spec 0.4) and a typical
 * piston annual-cycle pace.
 */
export const DEFAULT_LOOKAHEAD_DAYS = 30
export const DEFAULT_LOOKAHEAD_HOURS = 10

export interface AircraftCurrentValues {
  /** Latest Hobbs / total time. NULL if no readings exist. */
  current_hours: number | null
  /** Latest cycle count. NULL if not tracked. */
  current_cycles: number | null
}

export interface ComputeOptions {
  /** Override the lookahead window for "due-soon" classification. */
  lookahead_days?: number
  lookahead_hours?: number
  /** Reference date — defaults to today. Mostly for testing. */
  now?: Date
}

export interface ComputedDue {
  next_due_date: string | null
  next_due_hours: number | null
  next_due_cycles: number | null
  status: ComplianceStatus
}

/**
 * Compute next-due values + status for a single compliance item.
 *
 * Rules:
 *   1. If status is already 'deferred', preserve it (manual override).
 *   2. For each interval set (calendar / hours / cycles), compute its
 *      next-due value. If `last_completed_*` is missing, use the
 *      aircraft's current value as the starting point — this covers
 *      "I just installed this; from-now-forward".
 *   3. If ANY next-due value is in the past beyond tolerance → 'overdue'.
 *   4. Else if ANY next-due value is inside the lookahead window → 'due-soon'.
 *   5. Else → 'current'.
 */
export function computeDue(
  item: Pick<
    ComplianceItem,
    | 'status'
    | 'interval_calendar_months'
    | 'interval_hours'
    | 'interval_cycles'
    | 'tolerance_calendar_days'
    | 'tolerance_hours'
    | 'last_completed_date'
    | 'last_completed_hours'
    | 'last_completed_cycles'
  >,
  aircraft: AircraftCurrentValues,
  options: ComputeOptions = {},
): ComputedDue {
  // Manual deferred → never auto-flip
  if (item.status === 'deferred') {
    return {
      next_due_date: deriveNextDueDate(item),
      next_due_hours: deriveNextDueHours(item, aircraft),
      next_due_cycles: deriveNextDueCycles(item, aircraft),
      status: 'deferred',
    }
  }

  const next_due_date   = deriveNextDueDate(item)
  const next_due_hours  = deriveNextDueHours(item, aircraft)
  const next_due_cycles = deriveNextDueCycles(item, aircraft)

  const now = options.now ?? new Date()
  const lookahead_days = options.lookahead_days ?? DEFAULT_LOOKAHEAD_DAYS
  const lookahead_hours = options.lookahead_hours ?? DEFAULT_LOOKAHEAD_HOURS

  // Tolerance — past the due value is OK up to this much.
  const tolerance_days  = item.tolerance_calendar_days ?? 0
  const tolerance_hours = item.tolerance_hours ?? 0

  let isOverdue = false
  let isDueSoon = false

  // ── Calendar ────────────────────────────────────────────────────────────
  if (next_due_date) {
    const dueMs       = new Date(next_due_date).getTime()
    const toleranceMs = tolerance_days * MS_PER_DAY
    if (now.getTime() > dueMs + toleranceMs) {
      isOverdue = true
    } else if (dueMs - now.getTime() <= lookahead_days * MS_PER_DAY) {
      isDueSoon = true
    }
  }

  // ── Hours ───────────────────────────────────────────────────────────────
  if (next_due_hours != null && aircraft.current_hours != null) {
    const remaining = next_due_hours - aircraft.current_hours
    if (remaining < -tolerance_hours) {
      isOverdue = true
    } else if (remaining <= lookahead_hours) {
      isDueSoon = true
    }
  }

  // ── Cycles ──────────────────────────────────────────────────────────────
  // No tolerance for cycles in spec — they're discrete. No lookahead either:
  // hardcode "due-soon" when within 5% of next or 50 cycles, whichever smaller.
  if (next_due_cycles != null && aircraft.current_cycles != null) {
    const remaining = next_due_cycles - aircraft.current_cycles
    const lookahead = Math.min(50, next_due_cycles * 0.05)
    if (remaining < 0) {
      isOverdue = true
    } else if (remaining <= lookahead) {
      isDueSoon = true
    }
  }

  return {
    next_due_date,
    next_due_hours,
    next_due_cycles,
    status: isOverdue ? 'overdue' : isDueSoon ? 'due-soon' : 'current',
  }
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function deriveNextDueDate(
  item: Pick<ComplianceItem, 'interval_calendar_months' | 'last_completed_date'>,
): string | null {
  if (!item.interval_calendar_months) return null
  const anchor = item.last_completed_date ? new Date(item.last_completed_date) : null
  if (!anchor || isNaN(anchor.getTime())) return null
  const next = new Date(anchor)
  next.setMonth(next.getMonth() + item.interval_calendar_months)
  // ISO date (YYYY-MM-DD) without time component
  return next.toISOString().slice(0, 10)
}

function deriveNextDueHours(
  item: Pick<ComplianceItem, 'interval_hours' | 'last_completed_hours'>,
  aircraft: AircraftCurrentValues,
): number | null {
  if (item.interval_hours == null) return null
  const anchor = item.last_completed_hours ?? aircraft.current_hours
  if (anchor == null) return null
  return roundTo(anchor + item.interval_hours, 1)
}

function deriveNextDueCycles(
  item: Pick<ComplianceItem, 'interval_cycles' | 'last_completed_cycles'>,
  aircraft: AircraftCurrentValues,
): number | null {
  if (item.interval_cycles == null) return null
  const anchor = item.last_completed_cycles ?? aircraft.current_cycles
  if (anchor == null) return null
  return Math.round(anchor + item.interval_cycles)
}

function roundTo(n: number, decimals: number): number {
  const k = Math.pow(10, decimals)
  return Math.round(n * k) / k
}

/**
 * Filter + sort a list of items into a "due list" for an aircraft.
 * Used by /api/aircraft/[id]/compliance and the global Compliance page.
 *
 * Order: overdue first, then due-soon by closest-to-due, then current.
 * Deferred items are NOT included by default (lookahead is for active
 * items the user can act on).
 */
export function getDueList(
  items: ComplianceItem[],
  options: { include_deferred?: boolean } = {},
): ComplianceItem[] {
  const filtered = options.include_deferred
    ? items.filter((i) => i.status !== 'current')
    : items.filter((i) => i.status === 'overdue' || i.status === 'due-soon')

  const rank: Record<ComplianceStatus, number> = {
    overdue: 0, 'due-soon': 1, current: 2, deferred: 3,
  }
  return [...filtered].sort((a, b) => {
    const r = rank[a.status] - rank[b.status]
    if (r !== 0) return r
    // Same status: sort by closest next_due_date (earliest first)
    const ad = a.next_due_date ? new Date(a.next_due_date).getTime() : Infinity
    const bd = b.next_due_date ? new Date(b.next_due_date).getTime() : Infinity
    return ad - bd
  })
}
