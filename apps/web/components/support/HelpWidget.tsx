'use client'

/**
 * Phase 16 Sprint 16.2 — in-app help widget.
 *
 * Floating "?" button bottom-right on every persona page (mounted by
 * AppLayout). Opens a drawer with three tabs:
 *   - Submit ticket (POSTs to /api/support, pre-fills email/org from session)
 *   - View my tickets (GET /api/support, filtered to submitter)
 *   - Search docs (placeholder for the KB landing in Sprint 16.10)
 *
 * Persona-agnostic: visible to owner / mechanic / shop / admin.
 */
import { useEffect, useState } from 'react'
import { HelpCircle, X, Send, Loader2, MessageSquare, BookOpen, ChevronRight } from 'lucide-react'
import Link from 'next/link'

type Tab = 'submit' | 'mine' | 'docs'

interface MyTicket {
  id: string
  ticket_number: string
  subject: string
  status: string
  severity: string
  category: string
  created_at: string
}

const CATEGORIES = [
  { value: 'technical', label: 'Technical' },
  { value: 'billing', label: 'Billing' },
  { value: 'account', label: 'Account' },
  { value: 'feature_request', label: 'Feature' },
  { value: 'bug', label: 'Bug' },
  { value: 'other', label: 'Other' },
] as const

export function HelpWidget() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('submit')

  return (
    <>
      <button
        type="button"
        aria-label="Open help"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary/90"
      >
        <HelpCircle className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 p-5" onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[640px] max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-foreground" style={{ fontWeight: 600 }}>
                <HelpCircle className="h-4 w-4" /> Help
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex border-b border-border">
              <TabButton active={tab === 'submit'} onClick={() => setTab('submit')}>
                <Send className="h-3.5 w-3.5" /> Submit
              </TabButton>
              <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
                <MessageSquare className="h-3.5 w-3.5" /> My tickets
              </TabButton>
              <TabButton active={tab === 'docs'} onClick={() => setTab('docs')}>
                <BookOpen className="h-3.5 w-3.5" /> Docs
              </TabButton>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {tab === 'submit' && <SubmitTab onCreated={() => setTab('mine')} />}
              {tab === 'mine' && <MyTicketsTab />}
              {tab === 'docs' && <DocsTab />}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] transition-colors ${
        active ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
      style={{ fontWeight: active ? 600 : 500 }}
    >
      {children}
    </button>
  )
}

// ───────────────────────────────────────────────────────────────────

function SubmitTab({ onCreated }: { onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ ticket_number: string } | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: String(form.get('subject') ?? '').trim(),
          body: String(form.get('body') ?? '').trim(),
          category: String(form.get('category') ?? 'other'),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error ?? 'Failed'); return }
      setCreated(data as { ticket_number: string })
      setTimeout(onCreated, 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        Submitted. <span className="font-mono font-semibold">{created.ticket_number}</span>. AI is triaging…
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Category</label>
        <select name="category" defaultValue="technical" className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm">
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Subject</label>
        <input
          type="text" name="subject" required maxLength={240}
          className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
          placeholder="One-line summary"
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>Details</label>
        <textarea
          name="body" required rows={6} maxLength={10000}
          className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
          placeholder="What happened?"
        />
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{error}</div>}
      <button type="submit" disabled={submitting} className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
        {submitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Submit'}
      </button>
    </form>
  )
}

function MyTicketsTab() {
  const [tickets, setTickets] = useState<MyTicket[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/support')
      .then(async (r) => {
        const data = await r.json()
        if (cancelled) return
        if (!r.ok) { setError(data?.error ?? 'Failed'); return }
        setTickets(data.tickets ?? [])
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Network'))
    return () => { cancelled = true }
  }, [])

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{error}</div>
  if (!tickets) return <Loader2 className="mx-auto mt-8 h-5 w-5 animate-spin text-muted-foreground" />
  if (tickets.length === 0) return <p className="text-sm text-muted-foreground">No tickets yet. Submit your first above.</p>

  return (
    <ul className="space-y-2">
      {tickets.map((t) => (
        <li key={t.id}>
          <Link
            href={`/support/tickets/${t.ticket_number}`}
            className="flex items-start justify-between gap-2 rounded-lg border border-border bg-white p-3 hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] text-muted-foreground">{t.ticket_number}</p>
              <p className="truncate text-sm" style={{ fontWeight: 500 }}>{t.subject}</p>
              <p className="text-[11px] text-muted-foreground">
                {t.severity} · {t.status.replace(/_/g, ' ')}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function DocsTab() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>Knowledge base coming in Sprint 16.10 — auto-built from resolved tickets.</p>
      <p>For now, our most common questions are answered by AI triage on submitted tickets.</p>
      <Link href="/pricing" className="inline-flex items-center gap-1 text-primary hover:underline">
        How does pricing work?
        <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  )
}
