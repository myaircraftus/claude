'use client'

/**
 * Unified inbox client. Three-pane layout:
 *
 *   ┌────────┬──────────────────────┬─────────────────┐
 *   │ filters│ thread list          │ open thread     │
 *   │ (left) │ (center, scrolls)    │ (right, replies)│
 *   └────────┴──────────────────────┴─────────────────┘
 *
 * The right pane includes the compose box at the bottom. Selecting a
 * thread marks it read via GET /api/inbox/thread/[key] (the GET also
 * returns the messages — single round trip).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Loader2, Send, Inbox, Receipt, FileText, Bell, Mail, MessageSquare, Sparkles, CircleAlert, Check } from 'lucide-react'
import { toast } from 'sonner'

type Filter = 'all' | 'unread' | 'receipt' | 'estimate' | 'invoice' | 'reminder'

interface ThreadRowApi {
  thread_key: string
  latest: {
    id: string
    source: 'email' | 'sms'
    direction: 'inbound' | 'outbound'
    from_addr: string
    to_addr: string
    subject: string | null
    preview: string
    classified_as: string | null
    classify_confidence: string | null
    created_at: string
    related_work_order_id: string | null
  }
  unread: number
  message_count: number
}

interface MessageApi {
  id: string
  source: 'email' | 'sms'
  direction: 'inbound' | 'outbound'
  from_addr: string
  to_addr: string
  cc_addrs: string[]
  subject: string | null
  body_text: string | null
  body_html: string | null
  classified_as: string | null
  classify_confidence: string | null
  attachments: Array<{ filename?: string; size?: number; contentType?: string }>
  read_at: string | null
  created_at: string
  related_work_order_id: string | null
  related_expense_id?: string | null
  related_estimate_id?: string | null
  related_invoice_id?: string | null
}

const FILTERS: Array<{ id: Filter; label: string; icon: typeof Inbox }> = [
  { id: 'all', label: 'All', icon: Inbox },
  { id: 'unread', label: 'Unread', icon: CircleAlert },
  { id: 'receipt', label: 'Receipts', icon: Receipt },
  { id: 'estimate', label: 'Estimates', icon: Sparkles },
  { id: 'invoice', label: 'Invoices', icon: FileText },
  { id: 'reminder', label: 'Reminders', icon: Bell },
]

export function InboxClient({
  inboxEmail,
  userName,
}: {
  inboxEmail: string | null
  userName: string
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [threads, setThreads] = useState<ThreadRowApi[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageApi[]>([])
  const [threadLoading, setThreadLoading] = useState(false)

  // Compose state
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [sending, setSending] = useState(false)

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch(`/api/inbox?filter=${filter}`)
      if (!res.ok) return
      const j = (await res.json()) as { threads: ThreadRowApi[] }
      setThreads(j.threads ?? [])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchThreads()
    const t = setInterval(fetchThreads, 20000)
    return () => clearInterval(t)
  }, [fetchThreads])

  const openThread = useCallback(async (key: string) => {
    setSelectedKey(key)
    setThreadLoading(true)
    try {
      const res = await fetch(`/api/inbox/thread/${encodeURIComponent(key)}`)
      if (!res.ok) return
      const j = (await res.json()) as { messages: MessageApi[] }
      setMessages(j.messages ?? [])
      // Refresh thread list so the unread badge clears
      void fetchThreads()
    } finally {
      setThreadLoading(false)
    }
  }, [fetchThreads])

  const selectedThread = useMemo(
    () => threads.find((t) => t.thread_key === selectedKey) ?? null,
    [threads, selectedKey],
  )

  const lastInbound = messages.findLast((m) => m.direction === 'inbound')

  async function handleApprove(messageId: string) {
    const res = await fetch('/api/inbox/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId }),
    })
    if (res.ok) {
      toast.success('Approved')
      if (selectedKey) void openThread(selectedKey)
    } else {
      const err = await res.text()
      toast.error(`Approve failed: ${err.slice(0, 80)}`)
    }
  }

  async function handleReply() {
    if (!composeBody.trim() || sending) return
    setSending(true)
    try {
      const to =
        composeTo.trim() ||
        lastInbound?.from_addr ||
        selectedThread?.latest.from_addr ||
        ''
      const subject =
        composeSubject.trim() ||
        (selectedThread?.latest.subject?.startsWith('Re: ')
          ? selectedThread.latest.subject
          : `Re: ${selectedThread?.latest.subject ?? '(no subject)'}`)
      const res = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          body: composeBody.trim(),
          thread_key: selectedThread?.thread_key,
        }),
      })
      if (res.ok) {
        setComposeBody('')
        if (selectedKey) void openThread(selectedKey)
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="h-full grid grid-cols-[180px_320px_1fr] divide-x divide-border">
      {/* Filters */}
      <div className="overflow-y-auto bg-slate-50/40">
        <div className="px-3 py-3 border-b border-border">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Your inbox address
          </div>
          <div className="mt-1 text-[11px] font-mono break-all text-foreground">
            {inboxEmail ?? <span className="text-amber-700">unassigned</span>}
          </div>
        </div>
        <nav className="p-2 space-y-0.5">
          {FILTERS.map((f) => {
            const Icon = f.icon
            const isActive = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors',
                  isActive
                    ? 'bg-violet-100 text-violet-900 font-semibold'
                    : 'text-foreground hover:bg-slate-100',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {f.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Thread list */}
      <div className="overflow-y-auto bg-white">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 mx-auto animate-spin" />
          </div>
        ) : threads.length === 0 ? (
          <EmptyInbox inboxEmail={inboxEmail} />
        ) : (
          <ul className="divide-y divide-border">
            {threads.map((t) => {
              const isActive = t.thread_key === selectedKey
              const inbound = t.latest.direction === 'inbound'
              return (
                <li key={t.thread_key}>
                  <button
                    type="button"
                    onClick={() => openThread(t.thread_key)}
                    className={cn(
                      'w-full text-left px-3 py-3 hover:bg-slate-50 transition-colors',
                      isActive && 'bg-violet-50',
                      t.unread > 0 && 'font-semibold',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] truncate flex-1">
                        {inbound ? t.latest.from_addr : `to: ${t.latest.to_addr}`}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(t.latest.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-foreground truncate">
                      {t.latest.subject ?? '(no subject)'}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
                      {t.latest.preview}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      {t.latest.classified_as && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-700">
                          {t.latest.classified_as}
                        </span>
                      )}
                      {t.unread > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {t.unread} new
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        {t.latest.source === 'sms' ? (
                          <MessageSquare className="w-3 h-3" />
                        ) : (
                          <Mail className="w-3 h-3" />
                        )}
                        {t.message_count} {t.message_count === 1 ? 'msg' : 'msgs'}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Thread view */}
      <div className="overflow-hidden flex flex-col">
        {!selectedKey ? (
          <div className="flex-1 flex items-center justify-center text-center px-8 text-muted-foreground">
            <div className="max-w-sm">
              <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Select a thread to read it.</p>
              <p className="text-xs mt-1">
                Inbound mail to <span className="font-mono">{inboxEmail}</span> lands here.
                Outbound replies log alongside.
              </p>
            </div>
          </div>
        ) : threadLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-border">
              <div className="text-sm font-semibold text-foreground">
                {selectedThread?.latest.subject ?? '(no subject)'}
              </div>
              {selectedThread?.latest.classified_as && (
                <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-violet-900">
                  AI says: {selectedThread.latest.classified_as}
                  {selectedThread.latest.classify_confidence &&
                    ` · ${selectedThread.latest.classify_confidence}`}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const mine = m.direction === 'outbound'
                return (
                  <div
                    key={m.id}
                    className={cn('flex', mine ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                        mine
                          ? 'bg-violet-50 border border-violet-100 text-violet-950'
                          : 'bg-slate-50 border border-slate-100 text-foreground',
                      )}
                    >
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                        {m.source === 'sms' ? (
                          <MessageSquare className="w-3 h-3" />
                        ) : (
                          <Mail className="w-3 h-3" />
                        )}
                        {mine ? `${userName} (you)` : m.from_addr}
                        <span>·</span>
                        <span>{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                      <div className="whitespace-pre-wrap break-words">{m.body_text}</div>
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          {m.attachments.length} attachment
                          {m.attachments.length === 1 ? '' : 's'}:{' '}
                          {m.attachments.map((a) => a.filename ?? 'file').join(', ')}
                        </div>
                      )}
                      {/* AI-drafted artifact actions — inline approve buttons
                          for messages where the extractor agent already
                          drafted a row (cost_entries / estimates / invoices).
                          Owner/mechanic approves in-place; never has to leave
                          the inbox. */}
                      {!mine &&
                        (m.related_expense_id ||
                          m.related_estimate_id ||
                          m.related_invoice_id) && (
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleApprove(m.id)}
                              className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-2.5 py-1 text-[11px] font-semibold"
                            >
                              <Check className="w-3 h-3" />
                              Approve {m.related_expense_id
                                ? 'expense'
                                : m.related_estimate_id
                                  ? 'estimate'
                                  : 'invoice'}
                            </button>
                            <a
                              href={
                                m.related_expense_id
                                  ? '/economics'
                                  : m.related_estimate_id
                                    ? `/estimates`
                                    : `/invoices`
                              }
                              className="text-[11px] text-violet-700 hover:underline"
                            >
                              open full record
                            </a>
                          </div>
                        )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Compose */}
            <div className="border-t border-border p-3 bg-slate-50/40 space-y-2">
              <input
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                placeholder={lastInbound?.from_addr ?? 'to:'}
                className="w-full text-xs border border-border rounded px-2 py-1.5 bg-white"
              />
              <input
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder={`Re: ${selectedThread?.latest.subject ?? ''}`}
                className="w-full text-xs border border-border rounded px-2 py-1.5 bg-white"
              />
              <div className="flex gap-2">
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Type your reply…"
                  rows={3}
                  className="flex-1 text-sm border border-border rounded px-2 py-1.5 bg-white resize-none"
                />
                <button
                  type="button"
                  onClick={handleReply}
                  disabled={!composeBody.trim() || sending}
                  className="self-end inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 text-white text-sm font-semibold rounded-md px-3 py-2"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * EmptyInbox — Phase 2 coach. Calls the empty-state-coach agent to
 * surface tailored next actions ("Copy your inbox email", "Wire up
 * Flight Schedule Pro", etc.) instead of the boring "nothing here yet"
 * copy. Falls back gracefully when the agent returns nothing.
 */
function EmptyInbox({ inboxEmail }: { inboxEmail: string | null }) {
  const [suggestions, setSuggestions] = useState<
    Array<{ label: string; href: string; reason: string }>
  >([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch('/api/ux/empty-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pathname: '/messages',
          persona: 'owner',
          resource: 'inbox',
        }),
      })
      if (!res.ok || cancelled) return
      const j = (await res.json()) as {
        suggestions?: Array<{ label: string; href: string; reason: string }>
      }
      if (!cancelled) setSuggestions(j.suggestions ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="p-8 text-center text-xs text-muted-foreground space-y-3">
      <Inbox className="w-6 h-6 mx-auto opacity-50" />
      <div className="font-semibold text-foreground">Nothing here yet.</div>
      {inboxEmail && (
        <div className="text-[11px]">
          Send a test email to <span className="font-mono">{inboxEmail}</span> to see it
          land here.
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="pt-3 border-t border-border text-left max-w-xs mx-auto space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Suggested next steps
          </div>
          {suggestions.map((s, i) => (
            <a
              key={i}
              href={s.href}
              className="block rounded-md border border-border bg-white px-3 py-2 hover:bg-violet-50 hover:border-violet-200 transition-colors"
            >
              <div className="text-[12px] font-semibold text-foreground">{s.label}</div>
              {s.reason && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">{s.reason}</div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
