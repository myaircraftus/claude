'use client'

/**
 * myaircraft.us — <ConfidenceBadge>
 *
 * A small pill expressing how confident an AI-assisted result is. Pairs an
 * inline status icon with a "<Level> Confidence" label.
 *
 *   <ConfidenceBadge level="high" />
 */

import { Icon, type IconName } from '../../icons/Icon'

export type ConfidenceLevel = 'high' | 'medium' | 'low'

interface ConfidenceSpec {
  label: string
  icon: IconName
  /** Darker text color of the hue. */
  color: string
  /** Light-tinted background of the same hue. */
  bg: string
}

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, ConfidenceSpec> = {
  high:   { label: 'High Confidence',   icon: 'check-circle', color: '#059669', bg: '#ECFDF5' },
  medium: { label: 'Medium Confidence', icon: 'info',         color: '#D97706', bg: '#FFFBEB' },
  low:    { label: 'Low Confidence',    icon: 'warning',      color: '#DC2626', bg: '#FEF2F2' },
}

export interface ConfidenceBadgeProps {
  /** The confidence level to display. */
  level: ConfidenceLevel
  /** Extra class names forwarded to the root pill. */
  className?: string
}

/**
 * Renders a confidence pill for an AI-assisted result.
 */
export function ConfidenceBadge({ level, className }: ConfidenceBadgeProps) {
  const cfg = CONFIDENCE_CONFIG[level]

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

export default ConfidenceBadge
