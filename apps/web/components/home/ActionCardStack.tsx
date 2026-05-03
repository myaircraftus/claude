'use client'

/**
 * ActionCardStack (Spec 5.1 / 5.2) — embeddable AI Inbox.
 *
 * Reuses the same useAIInbox hook + ActionCard component that powers
 * /(app)/inbox so both surfaces stay in lockstep. Difference vs
 * <AIInbox/>: this version ships without the page-shaped header, has a
 * configurable max card count, and exposes an `emptyHint` so SmartHome
 * can show a celebratory message when the stack is clear.
 *
 * Phase 5.2 will add filtering by category/aircraft + grouping; for
 * now, urgent + high cards float to the top via priority sort.
 */

import { AnimatePresence } from 'motion/react'
import { Sparkles, Loader2 } from 'lucide-react'
import { useAIInbox } from '@/lib/ai/use-ai-inbox'
import { ActionCard } from '@/components/ai/action-card'
import type { ActionCardCategory, ActionCardPriority } from '@/lib/ai/types'

const PRIORITY_RANK: Record<ActionCardPriority, number> = {
  urgent: 0, high: 1, normal: 2, low: 3,
}

interface Props {
  /** Optional category filter — only show cards in these categories. */
  categories?: ActionCardCategory[]
  /** Cap on how many cards to render. Default 8. */
  maxCards?: number
  /** Heading shown above the stack. Default "Action Cards". */
  title?: string
  /** Empty-state copy. */
  emptyHint?: string
}

export function ActionCardStack({
  categories,
  maxCards = 8,
  title = 'Action Cards',
  emptyHint = 'Nothing needs your attention right now.',
}: Props) {
  const { cards, loading, dismiss, resolve } = useAIInbox()

  const filtered = (cards ?? [])
    .filter((c) => (categories ? categories.includes(c.category) : true))
    .sort((a, b) => {
      const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (p !== 0) return p
      return Date.parse(b.created_at) - Date.parse(a.created_at)
    })
    .slice(0, maxCards)

  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-3">
        <h2 className="text-[16px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
          {title}
        </h2>
        {!loading && cards.length > maxCards && (
          <a href="/inbox" className="text-[11.5px] text-primary inline-flex items-center gap-0.5">
            See all {cards.length} →
          </a>
        )}
      </div>

      {loading ? (
        <div className="bg-white border border-border rounded-2xl p-8 text-center">
          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin mx-auto mb-2" />
          <p className="text-[12px] text-muted-foreground">Loading…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-border rounded-2xl p-8 text-center">
          <Sparkles className="h-4 w-4 text-muted-foreground mx-auto mb-2" />
          <p className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{emptyHint}</p>
          <p className="text-[11.5px] text-muted-foreground mt-1">
            New cards appear as conditions change. Snooze or resolve from here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {filtered.map((c) => (
              <ActionCard key={c.id} card={c} onDismiss={dismiss} onResolve={resolve} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
