'use client'

/**
 * Admin reply form on /admin/support/[ticketNumber].
 *
 * Pre-fills with AI's staged suggested_response (if any) so admin can
 * edit-and-send in one step. POSTs to /api/admin/support/[id]/reply.
 *
 * Three actions:
 *   - "Approve & Send" (uses AI draft as-is)
 *   - "Send" (uses whatever's in the textarea)
 *   - "Mark wrong" (records ai_was_wrong feedback without sending)
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, ThumbsDown, X, AlertTriangle } from 'lucide-react'

interface Props {
  ticketId: string
  ticketNumber: string
  initialBody: string
  hasAiDraft: boolean
  status: string
}

export function AdminReplyForm({ ticketId, ticketNumber, initialBody, hasAiDraft, status }: Props) {
  const router = useRouter()
  const [body, setBody] = useState(initialBody)
  const [submitting, setSubmitting] = useState<'send' | 'resolve' | 'feedback' | 'p0' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resolveOnSend, setResolveOnSend] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackNote, setFeedbackNote] = useState('')

  const isClosed = status === 'closed' || status === 'resolved'
  const dirty = body !== initialBody

  async function send(opts: { resolve?: boolean }) {
    if (!body.trim()) {
      setError('Reply body is empty')
      return
    }
    setError(null)
    setSubmitting(opts.resolve ? 'resolve' : 'send')
    try {
      const res = await fetch(`/api/admin/support/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: body.trim(),
          resolve: opts.resolve === true,
          send_email: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error ?? 'Failed'); return }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitting(null)
    }
  }

  async function recordFeedback() {
    setError(null)
    setSubmitting('feedback')
    try {
      const res = await fetch(`/api/admin/support/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback: 'ai_was_wrong',
          note: feedbackNote.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error ?? 'Failed'); return }
      setShowFeedback(false)
      setFeedbackNote('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitting(null)
    }
  }

  async function escalateToP0() {
    setError(null)
    setSubmitting('p0')
    try {
      const res = await fetch('/api/admin/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ticketId, status: 'awaiting_admin' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error ?? 'Failed'); return }
      // Severity field isn't supported by /api/admin/support PATCH yet —
      // intentionally minimal mutation surface for v1. Sprint 16.x can
      // add a severity-update path. For now this re-flips status to
      // surface the ticket back at the top of the inbox.
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitting(null)
    }
  }

  if (isClosed) {
    return (
      <p className="text-sm text-muted-foreground">
        This ticket is {status}. Reopen via the All tickets surface to send a follow-up.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {hasAiDraft && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span className="mt-0.5">✨</span>
          <p>
            AI staged a draft reply. Edit if needed, then click <span className="font-semibold">Approve &amp; Send</span> (or
            <span className="font-semibold"> Mark wrong</span> to flag without sending).
          </p>
        </div>
      )}

      <textarea
        rows={8}
        maxLength={10000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Type your reply…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={resolveOnSend}
          onChange={(e) => setResolveOnSend(e.target.checked)}
        />
        Mark resolved after send
      </label>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitting !== null || !body.trim()}
          onClick={() => send({ resolve: resolveOnSend })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting === 'send' || submitting === 'resolve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {hasAiDraft && !dirty ? 'Approve & Send' : 'Send reply'}
        </button>

        {hasAiDraft && (
          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => setShowFeedback((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-muted/40 disabled:opacity-50"
          >
            <ThumbsDown className="h-4 w-4" />
            Mark wrong
          </button>
        )}

        <button
          type="button"
          disabled={submitting !== null}
          onClick={escalateToP0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {submitting === 'p0' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
          Escalate
        </button>
      </div>

      {showFeedback && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ fontWeight: 600 }}>Why was the AI draft wrong?</p>
            <button onClick={() => setShowFeedback(false)} className="rounded p-0.5 text-muted-foreground hover:bg-amber-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            rows={3}
            maxLength={500}
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.target.value)}
            placeholder="Optional note for triage tuning…"
            className="w-full rounded-md border border-amber-200 bg-white px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={recordFeedback}
            disabled={submitting !== null}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {submitting === 'feedback' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Record feedback'}
          </button>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {ticketNumber} · email queues to email_log; real provider hand-off deferred to a future sprint.
      </p>
    </div>
  )
}
