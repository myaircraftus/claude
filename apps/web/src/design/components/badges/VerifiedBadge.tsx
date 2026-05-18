'use client'

/**
 * myaircraft.us — <VerifiedBadge>
 *
 * A small pill marking a seller as identity-verified.
 *
 *   <VerifiedBadge />
 */

import { Icon } from '../../icons/Icon'

export interface VerifiedBadgeProps {
  /** Extra class names forwarded to the root pill. */
  className?: string
}

const VERIFIED_COLOR = '#2563EB'
const VERIFIED_BG = '#DBEAFE'

/**
 * Renders the "Verified Seller" pill.
 */
export function VerifiedBadge({ className }: VerifiedBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold leading-none${
        className ? ` ${className}` : ''
      }`}
      style={{ color: VERIFIED_COLOR, background: VERIFIED_BG }}
    >
      <Icon name="verified-seller" size={13} strokeWidth={2} />
      Verified Seller
    </span>
  )
}

export default VerifiedBadge
