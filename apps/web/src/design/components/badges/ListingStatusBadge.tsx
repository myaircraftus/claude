'use client'

/**
 * myaircraft.us — <ListingStatusBadge>
 *
 * A small pill describing the lifecycle state of a marketplace listing.
 * Active and draft render a colored dot; sold and expired render an icon.
 *
 *   <ListingStatusBadge status="active" />
 */

import { Icon, type IconName } from '../../icons/Icon'

export type ListingStatus = 'active' | 'draft' | 'sold' | 'expired'

interface ListingStatusSpec {
  label: string
  /** Darker text color of the hue. */
  color: string
  /** Light-tinted background of the same hue. */
  bg: string
  /** A leading dot (active/draft) or a leading icon (sold/expired). */
  marker: { kind: 'dot'; color: string } | { kind: 'icon'; name: IconName }
}

const STATUS_CONFIG: Record<ListingStatus, ListingStatusSpec> = {
  active:  { label: 'Active',  color: '#059669', bg: '#ECFDF5', marker: { kind: 'dot', color: '#059669' } },
  draft:   { label: 'Draft',   color: '#64748B', bg: '#F1F5F9', marker: { kind: 'dot', color: '#64748B' } },
  sold:    { label: 'Sold',    color: '#2563EB', bg: '#DBEAFE', marker: { kind: 'icon', name: 'check' } },
  expired: { label: 'Expired', color: '#DC2626', bg: '#FEF2F2', marker: { kind: 'icon', name: 'clock' } },
}

export interface ListingStatusBadgeProps {
  /** The listing lifecycle status to display. */
  status: ListingStatus
  /** Extra class names forwarded to the root pill. */
  className?: string
}

/**
 * Renders a status pill for a marketplace listing.
 */
export function ListingStatusBadge({ status, className }: ListingStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold leading-none${
        className ? ` ${className}` : ''
      }`}
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.marker.kind === 'dot' ? (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: cfg.marker.color,
            flexShrink: 0,
          }}
        />
      ) : (
        <Icon name={cfg.marker.name} size={13} strokeWidth={2.25} />
      )}
      {cfg.label}
    </span>
  )
}

export default ListingStatusBadge
