'use client'

/**
 * Phase 14 Sprint 14.4 — SLA banner shown above the upload picker.
 *
 * Reads the active tier and renders the locked SLA copy from
 * lib/billing/pricing-config.ts. Exists so every upload surface gets
 * the same exact wording — no hardcoded copy elsewhere.
 */
import { Clock, Zap, Sparkles } from 'lucide-react'
import {
  TIER_DEFINITIONS,
  type TierSlug,
} from '@/lib/billing/pricing-config'

const ICONS: Record<TierSlug, typeof Clock> = {
  beta: Sparkles,
  standard: Clock,
  pro: Zap,
}

const ACCENTS: Record<TierSlug, string> = {
  beta: 'bg-purple-50 border-purple-200 text-purple-900',
  standard: 'bg-blue-50 border-blue-200 text-blue-900',
  pro: 'bg-emerald-50 border-emerald-200 text-emerald-900',
}

export interface SlaBannerProps {
  tier: TierSlug
  /** Optional addendum (e.g. "Tier override: Pro on this aircraft"). */
  detail?: string
  className?: string
}

export function SlaBanner({ tier, detail, className }: SlaBannerProps) {
  const def = TIER_DEFINITIONS[tier]
  const Icon = ICONS[tier]
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${ACCENTS[tier]} ${className ?? ''}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <div className="font-medium">
          {def.name} tier · {def.sla === 'real-time' ? 'Real-time' : '24-hour batch'}
        </div>
        <div className="text-xs">{def.slaCopy}</div>
        {detail && <div className="mt-0.5 text-xs opacity-75">{detail}</div>}
      </div>
    </div>
  )
}
