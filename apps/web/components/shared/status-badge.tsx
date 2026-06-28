import { cn } from '@/lib/utils'

/**
 * StatusBadge — a reusable status pill (soft background + matching dot),
 * generalized from the Work Orders v2 status system (components/work-orders/
 * redesign/wo-status.ts). Each module supplies its own StatusMap so labels and
 * colors live in one place per feature instead of being re-declared (and
 * drifting) across its list and detail surfaces.
 */

export interface StatusToken {
  /** Display label; defaults to a humanized version of the status key. */
  label?: string
  /** Pill background + text classes, e.g. 'bg-blue-50 text-blue-700'. */
  pill: string
  /** Optional solid dot color class, e.g. 'bg-blue-500'. */
  dot?: string
}

export type StatusMap = Record<string, StatusToken>

/** Humanize an enum-ish key: 'awaiting_parts' -> 'Awaiting parts'. */
export function humanizeStatus(key: string): string {
  const s = key.replace(/_/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function resolveStatus(map: StatusMap, status: string): { label: string; pill: string; dot?: string } {
  const t = map[status]
  return {
    label: t?.label ?? humanizeStatus(status),
    pill: t?.pill ?? 'bg-slate-100 text-slate-600',
    dot: t?.dot,
  }
}

export function StatusBadge({
  map,
  status,
  withDot = true,
  className,
}: {
  map: StatusMap
  status: string
  withDot?: boolean
  className?: string
}) {
  const { label, pill, dot } = resolveStatus(map, status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap',
        pill,
        className,
      )}
    >
      {withDot && dot ? <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dot)} /> : null}
      {label}
    </span>
  )
}
