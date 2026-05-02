'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Message = {
  id: string
  thread_id: string
  sender_user_id: string
  sender_role: 'owner' | 'mechanic'
  body: string
  created_at: string
}

type Props = {
  /** Relative API base: '/api/owner' for portal users, '/api' for org members. */
  apiBase: '/api/owner' | '/api'
  /** Pre-resolved thread id, or customer id to bootstrap a thread against. */
  threadId?: string | null
  customerId?: string | null
  /** Which role label to use when posting. */
  viewerRole: 'owner' | 'mechanic'
  /** Optional compact header above the log. */
  heading?: string | null
  /** Compact mode removes the header. */
  compact?: boolean
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function ThreadPanel({
  apiBase,
  threadId: initialThreadId,
  customerId,
  viewerRole,
  heading = 'Messages',
  compact = false,
}: Props) {
  const [threadId, setThreadId] = useState<string | null>(initialThreadId ?? null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const ensureThread = useCallback(async () => {
    if (threadId) return threadId
    if (!customerId) throw new Error('Missing thread id and customer id')
    const res = await fetch(`${apiBase}/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
    setThreadId(data.thread.id)
    return data.thread.id as string
  }, [apiBase, customerId, threadId])

  const loadMessages = useCallback(async () => {
    if (!threadId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/threads/${encodeURIComponent(threadId)}/messages`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setMessages(data.messages ?? [])
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [apiBase, threadId])

  useEffect(() => {
    if (threadId) void loadMessages()
  }, [threadId, loadMessages])

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight })
  }, [messages.length])

  async function handleSend() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      const id = await ensureThread()
      const res = await fetch(`${apiBase}/threads/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setDraft('')
      setMessages((prev) => [...prev, data.message as Message])
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {!compact && heading && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="text-sm font-semibold text-foreground">{heading}</div>
        </div>
      )}
      <div
        ref={scrollerRef}
        className="max-h-80 overflow-y-auto p-4 space-y-3 text-sm"
      >
        {!threadId && !customerId && (
          <div className="text-xs text-muted-foreground">No thread linked.</div>
        )}
        {threadId && messages.length === 0 && !loading && (
          <div className="text-xs text-muted-foreground">No messages yet. Say hello.</div>
        )}
        {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
        {messages.map((m) => {
          const mine = m.sender_role === viewerRole
          return (
            <div key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={[
                  'max-w-[80%] rounded-lg px-3 py-2',
                  mine
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground',
                ].join(' ')}
              >
                <div className="text-[11px] opacity-75 mb-0.5">
                  {m.sender_role === 'owner' ? 'Owner' : 'Shop'} · {formatTime(m.created_at)}
                </div>
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="border-t border-border p-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void handleSend()
            }
          }}
          placeholder="Write a message… (⌘↵ to send)"
          rows={2}
          className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={sending}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
      {error && <div className="px-4 pb-3 text-xs text-red-600">{error}</div>}
    </div>
  )
}
