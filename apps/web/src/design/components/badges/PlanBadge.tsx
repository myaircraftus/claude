'use client'

/**
 * myaircraft.us — <PlanBadge>
 *
 * A small pill labelling a subscription tier. Text-only (no icon).
 *
 *   <PlanBadge plan="pro" />
 */

export type Plan = 'starter' | 'pro'

interface PlanSpec {
  label: string
  /** Darker text color of the hue. */
  color: string
  /** Light-tinted background of the same hue. */
  bg: string
}

const PLAN_CONFIG: Record<Plan, PlanSpec> = {
  starter: { label: 'Starter', color: '#1B2B5E', bg: '#E8EBF3' },
  pro:     { label: 'Pro',     color: '#7C3AED', bg: '#EDE9FE' },
}

export interface PlanBadgeProps {
  /** The subscription plan to display. */
  plan: Plan
  /** Extra class names forwarded to the root pill. */
  className?: string
}

/**
 * Renders a subscription plan pill.
 */
export function PlanBadge({ plan, className }: PlanBadgeProps) {
  const cfg = PLAN_CONFIG[plan]

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold leading-none${
        className ? ` ${className}` : ''
      }`}
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.label}
    </span>
  )
}

export default PlanBadge
