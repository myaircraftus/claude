'use client'

import { useState } from 'react'
import { AlertTriangle, Info, XCircle, CheckCircle, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RecordFinding } from '@/types/intelligence'

interface Props {
  finding: RecordFinding
  onResolve?: (id: string, note: string) => Promise<void>
  onAcknowledge?: (id: string, note: string) => Promise<void>
}

const SEVERITY_CONFIG = {
  critical: {
    icon: XCircle,
    label: 'Critical',
    border: 'border-red-500',
    bg: 'bg-red-50 dark:bg-red-950/20',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    iconClass: 'text-red-500',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Warning',
    border: 'border-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    iconClass: 'text-amber-500',
  },
  info: {
    icon: Info,
    label: 'Info',
    border: 'border-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    iconClass: 'text-blue-500',
  },
}

export function FindingCard({ finding, onResolve, onAcknowledge }: Props) {
  const [showNoteModal, setShowNoteModal] = useState<'resolve' | 'acknowledge' | null>(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const config = SEVERITY_CONFIG[finding.severity]
  const Icon = config.icon

  async function handleSubmit() {
    setLoading(true)
    try {
      if (showNoteModal === 'resolve' && onResolve) {
        await onResolve(finding.id, note)
      } else if (showNoteModal === 'acknowledge' && onAcknowledge) {
        await onAcknowledge(finding.id, note)
      }
      setShowNoteModal(null)
      setNote('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn('border-l-4 rounded-r-xl p-4', config.border, config.bg)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', config.iconClass)} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', config.badge)}>
                {config.label}
              </span>
              {finding.affected_component && (
                <span className="text-xs text-muted-foreground capitalize">
                  {finding.affected_component}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold mt-1">{finding.title}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{finding.description}</p>
            {finding.recommendation && (
              <p className="text-xs text-foreground/70 mt-2 italic">
                → {finding.recommendation}
              </p>
            )}
            {(finding.affected_date_start || finding.affected_date_end) && (
              <p className="text-xs text-muted-foreground mt-1">
                Period: {finding.affected_date_start ?? '?'} — {finding.affected_date_end ?? 'present'}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {!finding.is_resolved && (
          <div className="flex flex-col gap-1.5 shrink-0">
            {onResolve && (
              <button
                onClick={() => setShowNoteModal('resolve')}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium transition-colors"
              >
                <CheckCircle className="h-3 w-3" />
                Resolve
              </button>
            )}
            {!finding.is_acknowledged && onAcknowledge && (
              <button
                onClick={() => setShowNoteModal('acknowledge')}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted font-medium transition-colors"
              >
                <Eye className="h-3 w-3" />
                Acknowledge
              </button>
            )}
          </div>
        )}
      </div>

      {finding.is_acknowledged && !finding.is_resolved && (
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
          <Eye className="h-3 w-3" /> Acknowledged
          {finding.acknowledge_note && ` — "${finding.acknowledge_note}"`}
        </div>
      )}

      {/* Note modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-semibold text-base mb-1">
              {showNoteModal === 'resolve' ? 'Resolve Finding' : 'Acknowledge Finding'}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">{finding.title}</p>
            <textarea
              className="w-full px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              rows={3}
              placeholder={
                showNoteModal === 'resolve'
                  ? 'Describe how this was resolved…'
                  : 'Note why this is acknowledged but not resolved…'
              }
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-2 rounded-xl bg-foreground text-background font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? 'Saving…' : showNoteModal === 'resolve' ? 'Mark Resolved' : 'Acknowledge'}
              </button>
              <button
                onClick={() => { setShowNoteModal(null); setNote('') }}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
