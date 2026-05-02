'use client'

/**
 * AIInbox — stack of ActionCards (Spec 0.3).
 *
 * The home for the orchestrator's output. Lives on /(app)/inbox; once
 * Phase 5 (Smart Home Screen) replaces /dashboard, this component will
 * mount there too.
 */

import { AnimatePresence } from 'motion/react'
import { Inbox, Sparkles, Loader2 } from 'lucide-react'
import { useAIInbox } from '@/lib/ai/use-ai-inbox'
import { ActionCard } from './action-card'

export function AIInbox() {
  const { cards, loading, dismiss, resolve } = useAIInbox()

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            AI Inbox
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Action cards generated from signals across your aircraft, work orders, parts, and approvals.
            Dismiss what you've seen; tap an action to do it.
          </p>
        </div>
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0 mb-2" />
        )}
      </div>

      {!loading && cards.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center mb-3">
            <Inbox className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
            Inbox zero
          </h3>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-md mx-auto">
            New cards appear here as your aircraft, work orders, and integrations report signals.
            Try emitting a test signal to verify the pipeline.
          </p>
        </div>
      )}

      <div className="space-y-2.5">
        <AnimatePresence>
          {cards.map((card) => (
            <ActionCard
              key={card.id}
              card={card}
              onDismiss={dismiss}
              onResolve={resolve}
            />
          ))}
        </AnimatePresence>
      </div>

      <p className="pt-2 text-[11px] text-muted-foreground/80 inline-flex items-center gap-1">
        <Sparkles className="h-3 w-3" /> Polling every 60s · Spec 0.3
      </p>
    </div>
  )
}
