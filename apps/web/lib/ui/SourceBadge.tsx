'use client'

/**
 * SourceBadge (Spec 7.8) — small color-coded label that tells the user
 * how trustworthy a number is. Three tiers (collapsed from the 5-priority
 * scale in lib/source-priority.ts):
 *
 *   verified  (official, uploaded)  — green
 *   synced    (connected)           — blue
 *   estimated (tracked, estimated)  — amber
 *
 * Used next to revenue / cost / hours numbers wherever the user benefits
 * from knowing "is this a receipt I uploaded or a guess?".
 */

import { CheckCircle2, Radio, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSourceBadge, type SourceBadgeTier } from '@/lib/source-priority'

interface Props {
  /** Concrete source string (e.g. 'manual', 'extracted', 'airbly', 'adsb-exchange'). */
  source?: string | null
  /** Skip the source-string lookup and render this tier directly. */
  tier?: SourceBadgeTier
  /** Optional explicit label override; default = tier name. */
  label?: string
  className?: string
  size?: 'sm' | 'md'
}

const TONE: Record<SourceBadgeTier, string> = {
  verified:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  synced:    'bg-blue-50 text-blue-700 border-blue-200',
  estimated: 'bg-amber-50 text-amber-700 border-amber-200',
}

const ICON: Record<SourceBadgeTier, React.ComponentType<{ className?: string }>> = {
  verified:  CheckCircle2,
  synced:    Radio,
  estimated: Sparkles,
}

const LABEL: Record<SourceBadgeTier, string> = {
  verified:  'Verified',
  synced:    'Synced',
  estimated: 'Estimated',
}

export function SourceBadge({ source, tier, label, className, size = 'sm' }: Props) {
  const resolved: SourceBadgeTier = tier ?? getSourceBadge(source)
  const Icon = ICON[resolved]
  const sizing = size === 'md'
    ? 'text-[11px] px-2 py-0.5'
    : 'text-[10px] px-1.5 py-0.5'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 uppercase tracking-wider rounded-full border',
        sizing,
        TONE[resolved],
        className,
      )}
      style={{ fontWeight: 700 }}
      title={source ? `Source: ${source}` : undefined}
    >
      <Icon className={size === 'md' ? 'h-3 w-3' : 'h-2.5 w-2.5'} />
      {label ?? LABEL[resolved]}
    </span>
  )
}
