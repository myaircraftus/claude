'use client'

/**
 * myaircraft.us — <ConditionBadge>
 *
 * A small pill describing the physical/airworthiness condition of a part
 * or listing. Light-tinted background + darker text of the same hue, with
 * an inline icon before the label.
 *
 *   <ConditionBadge condition="overhauled" />
 */

import { Icon, type IconName } from '../../icons/Icon'

export type PartCondition =
  | 'new'
  | 'overhauled'
  | 'serviceable'
  | 'as-removed'
  | 'used'
  | 'for-repair'

interface ConditionSpec {
  label: string
  icon: IconName
  /** Darker text color of the hue. */
  color: string
  /** Light-tinted background of the same hue. */
  bg: string
}

const CONDITION_CONFIG: Record<PartCondition, ConditionSpec> = {
  new:           { label: 'New',         icon: 'star-filled',            color: '#059669', bg: '#ECFDF5' },
  overhauled:    { label: 'Overhauled',  icon: 'refresh',                color: '#2563EB', bg: '#DBEAFE' },
  serviceable:   { label: 'Serviceable', icon: 'condition-serviceable',  color: '#D97706', bg: '#FFFBEB' },
  'as-removed':  { label: 'As Removed',  icon: 'minus',                  color: '#64748B', bg: '#F1F5F9' },
  used:          { label: 'Used',        icon: 'clock',                  color: '#64748B', bg: '#F1F5F9' },
  'for-repair':  { label: 'For Repair',  icon: 'maintenance',            color: '#DC2626', bg: '#FEF2F2' },
}

export interface ConditionBadgeProps {
  /** The condition to display. */
  condition: PartCondition
  /** Extra class names forwarded to the root pill. */
  className?: string
}

/**
 * Renders a condition pill for a part listing.
 */
export function ConditionBadge({ condition, className }: ConditionBadgeProps) {
  const cfg = CONDITION_CONFIG[condition]

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold leading-none${
        className ? ` ${className}` : ''
      }`}
      style={{ color: cfg.color, background: cfg.bg }}
    >
      <Icon name={cfg.icon} size={13} strokeWidth={2} />
      {cfg.label}
    </span>
  )
}

export default ConditionBadge
