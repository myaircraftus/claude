/**
 * myaircraft.us — status & condition badges
 *
 * Small presentational pill components for the marketplace and document UI.
 * Barrel re-export — import any badge from a single path:
 *
 *   import { ConditionBadge, ConfidenceBadge } from '@/design/components/badges'
 */

export { ConditionBadge, type ConditionBadgeProps, type PartCondition } from './ConditionBadge'
export {
  ListingStatusBadge,
  type ListingStatusBadgeProps,
  type ListingStatus,
} from './ListingStatusBadge'
export { VerifiedBadge, type VerifiedBadgeProps } from './VerifiedBadge'
export { PlanBadge, type PlanBadgeProps, type Plan } from './PlanBadge'
export {
  ConfidenceBadge,
  type ConfidenceBadgeProps,
  type ConfidenceLevel,
} from './ConfidenceBadge'
