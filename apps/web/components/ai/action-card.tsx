'use client'

/**
 * ActionCard — single card on the AI Inbox (Spec 0.3).
 *
 * Renders the AI-generated headline, body, evidence, and tap-to-do
 * suggested actions. Each suggested action posts to /api/ai/tools/[name]
 * with its args; the user sees a sonner toast + the card auto-resolves on
 * a successful tool call.
 */

import { useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import {
  AlertTriangle, Calendar, ClipboardCheck, Sparkles, Wrench, Mail,
  TrendingUp, X, Check, ChevronDown, ChevronUp, Loader2, ShieldAlert,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActionCard as ActionCardType, ActionCardCategory, ActionCardPriority } from '@/lib/ai/types'

const CATEGORY_ICON: Record<ActionCardCategory, any> = {
  compliance:       ClipboardCheck,
  expiration:       Calendar,
  maintenance:      Wrench,
  approval:         Mail,
  anomaly:          AlertTriangle,
  insight:          Sparkles,
  'audit-finding':  ShieldAlert,
  prediction:       Activity,
}

const CATEGORY_TINT: Record<ActionCardCategory, string> = {
  compliance:       'bg-blue-50 text-blue-700 border-blue-200',
  expiration:       'bg-amber-50 text-amber-700 border-amber-200',
  maintenance:      'bg-violet-50 text-violet-700 border-violet-200',
  approval:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  anomaly:          'bg-rose-50 text-rose-700 border-rose-200',
  insight:          'bg-slate-50 text-slate-700 border-slate-200',
  'audit-finding':  'bg-orange-50 text-orange-700 border-orange-200',
  prediction:       'bg-indigo-50 text-indigo-700 border-indigo-200',
}

const PRIORITY_BAR: Record<ActionCardPriority, string> = {
  urgent: 'bg-rose-500',
  high:   'bg-amber-500',
  normal: 'bg-blue-400',
  low:    'bg-slate-300',
}

export function ActionCard({
  card,
  onDismiss,
  onResolve,
}: {
  card: ActionCardType
  onDismiss: (id: string) => void
  onResolve: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [busyTool, setBusyTool] = useState<string | null>(null)

  const Icon = CATEGORY_ICON[card.category] ?? TrendingUp

  // Drop any malformed suggested action (missing toolCall) — it can't post
  // to a tool, and reading action.toolCall.tool on it crashes the render.
  const actions = (card.suggested_actions ?? []).filter((a) => a?.toolCall?.tool)

  async function handleAction(actionIdx: number) {
    const action = actions[actionIdx]
    if (!action) return
    setBusyTool(action.toolCall.tool)
    try {
      const res = await fetch(`/api/ai/tools/${encodeURIComponent(action.toolCall.tool)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: action.toolCall.args ?? {} }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload?.error || `Action failed: ${action.label}`)
        return
      }
      // Many handlers are still TODOs in 0.3 — surface that honestly.
      if (payload?.result?.todo) {
        toast.message(`${action.label}: pending follow-up sprint`, {
          description: String(payload.result.todo),
        })
      } else {
        toast.success(`${action.label} done`)
      }
      onResolve(card.id)
    } catch {
      toast.error(`Action failed: ${action.label}`)
    } finally {
      setBusyTool(null)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="relative bg-white rounded-2xl border border-border overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Priority left-edge bar */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', PRIORITY_BAR[card.priority])} />

      <div className="pl-4 pr-3 py-3.5 flex items-start gap-3">
        <div className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border',
          CATEGORY_TINT[card.category],
        )}>
          <Icon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row: title + priority + category pill */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] text-foreground truncate" style={{ fontWeight: 600 }}>
                {card.title}
              </h3>
              <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-relaxed">
                {card.body}
              </p>
            </div>

            <button
              onClick={() => onDismiss(card.id)}
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted shrink-0"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Suggested actions */}
          {actions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-2.5">
              {actions.map((action, i) => {
                const busy = busyTool === action.toolCall.tool
                return (
                  <button
                    key={i}
                    onClick={() => handleAction(i)}
                    disabled={busy}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border transition-colors',
                      action.destructive
                        ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                        : 'border-border bg-muted/40 text-foreground hover:bg-muted',
                      busy && 'opacity-60 cursor-wait',
                    )}
                    style={{ fontWeight: 500 }}
                  >
                    {busy
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Check className="h-3 w-3" />}
                    {action.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Evidence (collapsible) */}
          {card.evidence.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded((x) => !x)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? 'Hide evidence' : `Why? (${card.evidence.length})`}
              </button>
              {expanded && (
                <ul className="mt-1.5 space-y-0.5 pl-4 list-disc text-[11.5px] text-muted-foreground">
                  {card.evidence.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Footer: confidence + source pill */}
          <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70" style={{ fontWeight: 600 }}>
            <span>{card.source}</span>
            <span aria-hidden>·</span>
            <span>{Math.round((card.confidence ?? 0) * 100)}% confidence</span>
            {card.persona && (
              <>
                <span aria-hidden>·</span>
                <span>{card.persona}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
