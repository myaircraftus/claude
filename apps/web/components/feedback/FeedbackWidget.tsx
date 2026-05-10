'use client'

/**
 * Phase 16 Sprint 16.9 — floating thumbs-up/down feedback widget.
 *
 * Mounted by AppLayout on every persona page. Throttled — once a user
 * dismisses or submits, the widget is hidden for 7 days (localStorage
 * key `aircraft.us:fb:lastShown`).
 *
 * On thumbs-down, expands to show a "What broke?" textarea before submit.
 */
import { useEffect, useState } from 'react'
import { ThumbsUp, ThumbsDown, X, Send, Loader2 } from 'lucide-react'

const STORAGE_KEY = 'aircraft.us:fb:lastShown'
const HIDE_FOR_MS = 7 * 24 * 60 * 60 * 1000

function shouldShow(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const last = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0)
    return Date.now() - last > HIDE_FOR_MS
  } catch {
    return false
  }
}

function markShown() {
  try { window.localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch { /* ignore */ }
}

export function FeedbackWidget() {
  const [visible, setVisible] = useState(false)
  const [stage, setStage] = useState<'choose' | 'comment'>('choose')
  const [direction, setDirection] = useState<'up' | 'down' | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Defer to first idle frame so we don't compete with above-the-fold.
    const id = setTimeout(() => {
      if (shouldShow()) setVisible(true)
    }, 4000)
    return () => clearTimeout(id)
  }, [])

  function dismiss() {
    markShown()
    setVisible(false)
  }

  async function submit(payload: { type: 'thumbs'; score: 0 | 1; body?: string }) {
    setBusy(true)
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          source_page: typeof window !== 'undefined' ? window.location.pathname : null,
        }),
      })
      markShown()
      setVisible(false)
    } catch {
      /* swallow — feedback is best-effort */
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-5 left-5 z-30 max-w-xs rounded-2xl border border-border bg-white shadow-lg">
      {stage === 'choose' ? (
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="flex-1">
            <p className="text-sm" style={{ fontWeight: 600 }}>How are we doing?</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => submit({ type: 'thumbs', score: 1 })}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-sm hover:bg-emerald-50 disabled:opacity-50"
              >
                <ThumbsUp className="h-4 w-4 text-emerald-600" /> Good
              </button>
              <button
                onClick={() => { setDirection('down'); setStage('comment') }}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-sm hover:bg-rose-50 disabled:opacity-50"
              >
                <ThumbsDown className="h-4 w-4 text-rose-600" /> Bad
              </button>
            </div>
          </div>
          <button onClick={dismiss} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-2 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ fontWeight: 600 }}>What broke?</p>
            <button onClick={dismiss} className="rounded p-1 text-muted-foreground hover:bg-muted">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            rows={3}
            maxLength={4000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional — what should be different?"
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => submit({ type: 'thumbs', score: 0, body: comment.trim() || undefined })}
              disabled={busy}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
