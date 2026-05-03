'use client'

/**
 * PredictionCard (Spec 5.3) — specialty wrapper over the existing
 * ActionCard for category='prediction'. Used on the AI Inbox surface;
 * future per-aircraft predictions panel can mount it directly.
 *
 * The base ActionCard already renders prediction-shaped cards correctly
 * (title + body + evidence + suggested actions); this wrapper adds the
 * Activity icon + a confidence badge that's slightly more prominent.
 */

import { Activity } from 'lucide-react'
import { ActionCard } from '@/components/ai/action-card'
import { cn } from '@/lib/utils'
import type { ActionCard as ActionCardType } from '@/lib/ai/types'

interface Props {
  card: ActionCardType
  onDismiss: (id: string) => void
  onResolve: (id: string) => void
  className?: string
}

export function PredictionCard({ card, onDismiss, onResolve, className }: Props) {
  return (
    <div className={cn('relative', className)}>
      <div className="absolute -top-2 -left-2 z-10">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border bg-white text-slate-700 border-slate-300 shadow-sm" style={{ fontWeight: 700 }}>
          <Activity className="h-3 w-3" /> Prediction · {Math.round(card.confidence * 100)}%
        </span>
      </div>
      <ActionCard card={card} onDismiss={onDismiss} onResolve={onResolve} />
    </div>
  )
}
