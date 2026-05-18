/**
 * SOP-DOC-001 §5 / §6 — Shared Records attribution.
 *
 * `SharedRecordBadge` marks a record in the OWNER view that was created and
 * uploaded by a shop and shared to the owner. Shared records are read-only
 * in the owner view (no edit / no delete — see SOP §5.3).
 *
 * `SharedToOwnerBadge` is the SHOP-side counterpart: it marks a record the
 * shop has already shared to the owner.
 */
import { Lock, Check } from 'lucide-react'
import { formatDate } from '@/lib/utils'

/** myaircraft.us teal — the shared-records accent color. */
const TEAL = '#0E6E6E'

function toDateString(value: string | Date): string {
  if (value instanceof Date) return formatDate(value.toISOString())
  return formatDate(value)
}

export interface SharedRecordBadgeProps {
  /** Name of the shop that created and shared the record. */
  shopName: string
  /** When the record was shared with the owner. */
  sharedAt: string | Date
}

/** Owner view — "Shared by [shop]", read-only attribution. */
export function SharedRecordBadge({ shopName, sharedAt }: SharedRecordBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color: TEAL, borderColor: `${TEAL}33`, backgroundColor: `${TEAL}0D` }}
      title={`Shared by ${shopName} — read-only record`}
    >
      <Lock className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">Shared by {shopName}</span>
      <span className="text-muted-foreground">· {toDateString(sharedAt)}</span>
    </span>
  )
}

export interface SharedToOwnerBadgeProps {
  /** When the record was shared with the owner. */
  sharedAt: string | Date
}

/** Shop view — "Shared ✓", confirms a record has been published to the owner. */
export function SharedToOwnerBadge({ sharedAt }: SharedToOwnerBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700"
      title={`Shared with the owner on ${toDateString(sharedAt)}`}
    >
      <Check className="h-3 w-3 shrink-0" aria-hidden />
      <span>Shared</span>
      <span className="text-emerald-600/70">· {toDateString(sharedAt)}</span>
    </span>
  )
}
