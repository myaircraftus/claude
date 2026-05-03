'use client'

/**
 * AuditFindingsCard (Spec 5.5) — audit-finding ActionCard variant.
 *
 * The AI Inbox already renders all ai_action_cards via the generic
 * <ActionCard/> from sprint 0c. This component is a thin specialty
 * wrapper for surfaces that want to highlight ONLY audit findings —
 * e.g. a "Recent audits" tab on a future shop-foreman dashboard, or
 * an embedded list inside the work-order detail page.
 *
 * Reuses ActionCard underneath so dismiss/resolve/suggested-actions
 * behavior stays consistent. Adds an audit-specific severity ribbon
 * along the left edge based on priority (urgent=red, high=amber,
 * normal=blue).
 *
 * Phase 5.2's filtering work will let the main AI Inbox filter to
 * category='audit-finding'; until then this is the dedicated surface.
 */

import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { ActionCard } from '@/components/ai/action-card'
import { useAIInbox } from '@/lib/ai/use-ai-inbox'
import { cn } from '@/lib/utils'

interface Props {
  /** Cap on cards rendered. Default 5. */
  maxCards?: number
  className?: string
  /** When true, also render the "audit clear" insight cards (low priority). */
  showCleared?: boolean
}

export function AuditFindingsCard({ maxCards = 5, className = '', showCleared = false }: Props) {
  const { cards, loading, dismiss, resolve } = useAIInbox()

  const audits = (cards ?? [])
    .filter((c) => c.category === 'audit-finding')
    .filter((c) => (showCleared ? true : c.priority !== 'low'))
    .slice(0, maxCards)

  if (loading) return null
  if (audits.length === 0) {
    return (
      <div className={cn(
        'bg-white border border-border rounded-2xl p-5 text-center',
        className,
      )}>
        <ShieldCheck className="h-5 w-5 text-emerald-600 mx-auto mb-2" />
        <p className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
          No active audit findings
        </p>
        <p className="text-[11.5px] text-muted-foreground mt-1">
          Closed work orders are checked automatically. New findings appear here.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5 text-orange-700" />
        <span>{audits.length} audit {audits.length === 1 ? 'finding' : 'findings'}</span>
      </div>
      {audits.map((c) => (
        <div key={c.id} className="relative">
          <div
            className={cn(
              'absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl',
              c.priority === 'urgent' && 'bg-rose-500',
              c.priority === 'high'   && 'bg-amber-500',
              c.priority === 'normal' && 'bg-blue-400',
              c.priority === 'low'    && 'bg-slate-300',
            )}
          />
          <div className="pl-2">
            <ActionCard card={c} onDismiss={dismiss} onResolve={resolve} />
          </div>
        </div>
      ))}
    </div>
  )
}
