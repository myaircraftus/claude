'use client'

/**
 * /admin/ingestion-health — operator dashboard for the ingestion pipeline.
 *
 * Every classifier-tag row is expandable to show the actual failures behind
 * it. Every individual failure row has:
 *   - "Get AI suggestion" — sends the error to an LLM that proposes a
 *     classification + regex + rationale. NOTHING auto-applies; the
 *     suggestion is rendered in a card for human review.
 *   - "Copy for chat" — copies a structured block to the clipboard with
 *     the doc title, error, AI suggestion (if any), so the admin can
 *     paste it straight into a chat with Claude or an engineer.
 *
 * The whole page is the safe path between "no visibility" and "AI rewrites
 * prod code on its own" — operator stays in the loop, AI does the legwork.
 */

import { useEffect, useState } from 'react'
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Send,
} from 'lucide-react'

interface EnrichedFailure {
  id: string
  classifier_tag: string
  severity: string
  outcome: string
  occurred_at: string
  document_id: string
  error_message: string
  pipeline_stage: string | null
  attempt_number: number
  document_title: string
  aircraft_tail: string | null
  current_doc_status: string
}

interface TagSummary {
  tag: string
  severity: string
  total_7d: number
  last_24h: number
  recovered: number
  failed_open: number
  gave_up: number
  last_occurred_at: string | null
  failures: EnrichedFailure[]
}

interface HealthResponse {
  summary: {
    total_7d: number
    last_24h: number
    recovered_7d: number
    gave_up_7d: number
    unknown_patterns: number
  }
  by_tag: TagSummary[]
  recent_failures: EnrichedFailure[]
}

interface AISuggestion {
  classification: 'transient' | 'permanent' | 'unclear'
  classifier_tag: string
  regex_pattern: string
  rationale: string
  needs_code_change: boolean
  code_change_summary: string
}

export function IngestionHealthClient() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set())
  const [suggestions, setSuggestions] = useState<
    Record<string, { loading: boolean; result?: AISuggestion; error?: string }>
  >({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [queueing, setQueueing] = useState<Record<string, 'idle' | 'sending' | 'queued' | 'error'>>({})
  const [queue, setQueue] = useState<
    Array<{
      id: string
      status: string
      created_at: string
      resolved_at: string | null
      resolution_summary: string | null
      failure_snapshot: { document_title?: string; aircraft_tail?: string | null; classifier_tag?: string }
      operator_note?: string | null
    }>
  >([])
  const [queueLoading, setQueueLoading] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ingestion-health', { cache: 'no-store' })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(`HTTP ${res.status}: ${msg}`)
      }
      const json = (await res.json()) as HealthResponse
      setData(json)
      // Auto-expand the unknowns row if there are any — that's where the
      // operator's attention should land first.
      if (json.by_tag.some((t) => t.tag === 'unknown')) {
        setExpandedTags((prev) => new Set(prev).add('unknown'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function loadQueue() {
    setQueueLoading(true)
    try {
      const res = await fetch('/api/admin/ingestion-health/send-to-claude', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setQueue(Array.isArray(json.requests) ? json.requests : [])
    } finally {
      setQueueLoading(false)
    }
  }

  useEffect(() => {
    void load()
    void loadQueue()
  }, [])

  const [bulkSending, setBulkSending] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  async function sendAllToClaude() {
    setBulkSending(true)
    setBulkResult(null)
    try {
      const res = await fetch('/api/admin/ingestion-health/send-to-claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk_all_failures: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      setBulkResult(
        json.queued > 0
          ? `✓ Queued ${json.queued} failures (${json.skipped ?? 0} already in queue). Tell Claude "check the queue" in chat.`
          : `Nothing new to queue. ${json.skipped ?? 0} are already pending Claude review.`,
      )
      void loadQueue()
      void load()
    } catch (err) {
      setBulkResult(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBulkSending(false)
      window.setTimeout(() => setBulkResult(null), 8000)
    }
  }

  async function sendToClaude(failure: EnrichedFailure) {
    setQueueing((prev) => ({ ...prev, [failure.id]: 'sending' }))
    try {
      const res = await fetch('/api/admin/ingestion-health/send-to-claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          failure_id: failure.id,
          document_id: failure.document_id,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setQueueing((prev) => ({ ...prev, [failure.id]: 'queued' }))
      void loadQueue()
    } catch {
      setQueueing((prev) => ({ ...prev, [failure.id]: 'error' }))
    }
  }

  function toggleTag(tag: string) {
    setExpandedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  async function requestSuggestion(failure: EnrichedFailure) {
    setSuggestions((prev) => ({ ...prev, [failure.id]: { loading: true } }))
    try {
      const res = await fetch('/api/admin/ingestion-health/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error_message: failure.error_message,
          document_id: failure.document_id,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      setSuggestions((prev) => ({
        ...prev,
        [failure.id]: { loading: false, result: json.suggestion as AISuggestion },
      }))
    } catch (err) {
      setSuggestions((prev) => ({
        ...prev,
        [failure.id]: {
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        },
      }))
    }
  }

  async function copyForChat(failure: EnrichedFailure) {
    const sugg = suggestions[failure.id]?.result
    const block = [
      `Ingestion failure I want help with:`,
      ``,
      `Doc: ${failure.aircraft_tail ?? '—'} / ${failure.document_title}`,
      `Doc ID: ${failure.document_id}`,
      `Pipeline stage: ${failure.pipeline_stage ?? 'unknown'}`,
      `Classifier tag: ${failure.classifier_tag} (${failure.severity})`,
      `Outcome: ${failure.outcome}`,
      `Occurred: ${new Date(failure.occurred_at).toLocaleString()}`,
      `Current doc status: ${failure.current_doc_status}`,
      ``,
      `Error message:`,
      '```',
      failure.error_message,
      '```',
      ...(sugg
        ? [
            ``,
            `AI suggestion:`,
            `- classification: ${sugg.classification}`,
            `- suggested tag: ${sugg.classifier_tag}`,
            `- suggested regex: ${sugg.regex_pattern}`,
            `- rationale: ${sugg.rationale}`,
            `- needs_code_change: ${sugg.needs_code_change}`,
            ...(sugg.code_change_summary
              ? [`- code change: ${sugg.code_change_summary}`]
              : []),
          ]
        : []),
      ``,
      `Please review and tell me what to ship.`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(block)
      setCopiedKey(failure.id)
      window.setTimeout(() => setCopiedKey((k) => (k === failure.id ? null : k)), 2000)
    } catch {
      // Clipboard API may be blocked on http or in iframes — fall back to a prompt.
      window.prompt('Copy this and paste into chat:', block)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ingestion Health</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Click any failure category to expand. Use <strong>Get AI suggestion</strong> on a row to ask the LLM what
            it thinks. Use <strong>Copy for chat</strong> to paste a structured summary into your chat with Claude (or
            anyone debugging).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void sendAllToClaude()}
            disabled={bulkSending}
            className="inline-flex items-center gap-1.5 bg-violet-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
            title="Queue every recent failure (last 7 days, not yet recovered) for Claude in one click"
          >
            {bulkSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {bulkSending ? 'Queueing all…' : 'Send all to Claude'}
          </button>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs hover:bg-muted/30 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {bulkResult && (
        <div
          className={
            'rounded-lg border px-4 py-2 text-xs ' +
            (bulkResult.startsWith('✓')
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : bulkResult.startsWith('Failed')
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-slate-200 bg-slate-50 text-slate-800')
          }
        >
          {bulkResult}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong>Failed to load:</strong> {error}
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Top-level stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Last 24h" value={data.summary.last_24h} tone="amber" />
            <StatCard label="Last 7d" value={data.summary.total_7d} tone="amber" />
            <StatCard label="Recovered (7d)" value={data.summary.recovered_7d} tone="emerald" />
            <StatCard label="Gave up (7d)" value={data.summary.gave_up_7d} tone="red" />
            <StatCard
              label="Unknown patterns"
              value={data.summary.unknown_patterns}
              tone={data.summary.unknown_patterns > 0 ? 'red' : 'slate'}
            />
          </div>

          {/* Per-tag rollup with expandable failure rows */}
          <section className="rounded-xl border border-border bg-white">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">Failure categories (last 7 days)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Click a row to see individual failures. Each one has a <strong>Get AI suggestion</strong> button and a{' '}
                <strong>Copy for chat</strong> button.
              </p>
            </div>

            {data.by_tag.length === 0 && (
              <div className="px-5 py-8 text-center text-muted-foreground">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                No failures in the last 7 days. Pipeline is healthy.
              </div>
            )}

            <div className="divide-y divide-border">
              {data.by_tag.map((tag) => {
                const expanded = expandedTags.has(tag.tag)
                const isUnknown = tag.tag === 'unknown'
                return (
                  <div key={tag.tag}>
                    {/* Header row — clickable to toggle expand */}
                    <button
                      onClick={() => toggleTag(tag.tag)}
                      className={`w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/30 transition-colors ${
                        isUnknown ? 'bg-red-50/40' : ''
                      }`}
                    >
                      {expanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <code className="font-mono text-xs text-foreground">{tag.tag}</code>
                      <SeverityPill severity={tag.severity} />
                      <span className="text-xs text-muted-foreground ml-auto flex items-center gap-3">
                        <span>
                          24h: <strong className="text-foreground tabular-nums">{tag.last_24h}</strong>
                        </span>
                        <span>
                          7d: <strong className="text-foreground tabular-nums">{tag.total_7d}</strong>
                        </span>
                        <span className="text-emerald-700">
                          recovered <strong className="tabular-nums">{tag.recovered}</strong>
                        </span>
                        {tag.gave_up > 0 && (
                          <span className="text-red-700">
                            gave up <strong className="tabular-nums">{tag.gave_up}</strong>
                          </span>
                        )}
                      </span>
                    </button>

                    {/* Expanded — list of failures inside this tag */}
                    {expanded && (
                      <div className="bg-slate-50/40 border-t border-slate-100 divide-y divide-slate-100">
                        {tag.failures.map((failure) => {
                          const sugg = suggestions[failure.id]
                          const justCopied = copiedKey === failure.id
                          return (
                            <div key={failure.id} className="px-6 py-3 space-y-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="text-xs text-foreground font-medium">
                                    {failure.aircraft_tail && (
                                      <span className="font-mono text-primary">{failure.aircraft_tail}</span>
                                    )}
                                    {failure.aircraft_tail && ' · '}
                                    {failure.document_title}
                                    <span className="text-muted-foreground font-normal ml-2">
                                      now: {failure.current_doc_status}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {new Date(failure.occurred_at).toLocaleString()} · stage:{' '}
                                    {failure.pipeline_stage ?? '—'} · attempt {failure.attempt_number} ·{' '}
                                    <span className={failure.outcome === 'recovered' ? 'text-emerald-700' : ''}>
                                      outcome: {failure.outcome}
                                    </span>
                                  </div>
                                  <pre className="text-[11px] bg-white border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                                    {failure.error_message}
                                  </pre>
                                </div>
                                <div className="flex flex-col gap-1.5 shrink-0">
                                  <button
                                    onClick={() => void sendToClaude(failure)}
                                    disabled={queueing[failure.id] === 'sending' || queueing[failure.id] === 'queued'}
                                    className={
                                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ' +
                                      (queueing[failure.id] === 'queued'
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50')
                                    }
                                    title="Queue this failure for Claude to read and fix automatically next time you're in chat"
                                  >
                                    {queueing[failure.id] === 'sending' ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : queueing[failure.id] === 'queued' ? (
                                      <Check className="w-3 h-3" />
                                    ) : (
                                      <Send className="w-3 h-3" />
                                    )}
                                    {queueing[failure.id] === 'sending'
                                      ? 'Queueing…'
                                      : queueing[failure.id] === 'queued'
                                        ? 'Sent to Claude'
                                        : queueing[failure.id] === 'error'
                                          ? 'Retry'
                                          : 'Send to Claude'}
                                  </button>
                                  <button
                                    onClick={() => void requestSuggestion(failure)}
                                    disabled={sugg?.loading}
                                    className="inline-flex items-center gap-1.5 bg-primary text-white px-2.5 py-1 rounded-md text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                  >
                                    {sugg?.loading ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Sparkles className="w-3 h-3" />
                                    )}
                                    AI suggest
                                  </button>
                                  <button
                                    onClick={() => void copyForChat(failure)}
                                    className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1 rounded-md text-[11px] hover:bg-muted/30 transition-colors"
                                  >
                                    {justCopied ? (
                                      <Check className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                    {justCopied ? 'Copied!' : 'Copy for chat'}
                                  </button>
                                </div>
                              </div>

                              {sugg?.error && (
                                <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
                                  {sugg.error}
                                </div>
                              )}

                              {sugg?.result && <SuggestionCard suggestion={sugg.result} />}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Claude review queue */}
          <section className="rounded-xl border border-violet-200 bg-violet-50/40">
            <div className="px-5 py-3 border-b border-violet-200 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Send className="w-4 h-4 text-violet-600" />
                  Claude review queue
                  <span className="text-xs text-muted-foreground font-normal">
                    ({queue.filter((q) => q.status === 'pending').length} pending)
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Items sent here are read by Claude on the next chat session — no copy-paste needed. Just say{' '}
                  <strong>&ldquo;check the queue&rdquo;</strong> in chat and Claude grabs everything pending in one
                  pass.
                </p>
              </div>
              <button
                onClick={() => void loadQueue()}
                disabled={queueLoading}
                className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1 rounded-md text-[11px] hover:bg-muted/30 transition-colors disabled:opacity-50"
              >
                {queueLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Refresh queue
              </button>
            </div>
            <div className="divide-y divide-violet-100">
              {queue.length === 0 && (
                <div className="px-5 py-6 text-center text-xs text-muted-foreground">
                  Queue is empty. Click <strong>Send to Claude</strong> on any failure above to add it.
                </div>
              )}
              {queue.map((item) => {
                const snap = item.failure_snapshot ?? {}
                const tag = (snap as any).classifier_tag ?? '—'
                const tail = (snap as any).aircraft_tail ?? ''
                const title = (snap as any).document_title ?? '(unknown doc)'
                return (
                  <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-foreground">
                        {tail && <span className="font-mono text-primary">{tail} · </span>}
                        {title}
                        <span className="ml-2 text-muted-foreground">
                          tag: <code className="font-mono">{tag}</code>
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Queued {new Date(item.created_at).toLocaleString()}
                        {item.resolved_at &&
                          ` · resolved ${new Date(item.resolved_at).toLocaleString()}`}
                      </div>
                      {item.resolution_summary && (
                        <div className="text-[11px] text-foreground mt-1 italic">
                          Claude&rsquo;s note: {item.resolution_summary}
                        </div>
                      )}
                    </div>
                    <span
                      className={
                        'shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ' +
                        (item.status === 'pending'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : item.status === 'in_review'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : item.status === 'resolved'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border-slate-300')
                      }
                    >
                      {item.status}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Quick-help footer */}
          <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 text-xs text-blue-900 leading-relaxed">
            <strong className="block text-sm mb-1">How to use this page</strong>
            <ol className="list-decimal pl-5 space-y-1">
              <li>
                <strong>Find an interesting row</strong> — usually <code className="font-mono">unknown</code> (red), any
                row where <em>gave up</em> &gt; 0, or any row that keeps recurring.
              </li>
              <li>
                <strong>Click the row</strong> to expand and see the actual failures behind it.
              </li>
              <li>
                <strong>Send to Claude</strong> (purple button) is the one-click path: it queues the failure for review
                in the panel above. Next time you open chat with Claude, just say <em>&ldquo;check the queue&rdquo;</em>{' '}
                — Claude reads everything, ships the fix, and marks the row resolved. Zero copy-paste.
              </li>
              <li>
                <strong>AI suggest</strong> gives an inline LLM-proposed classification + regex on this page, without
                shipping anything. For known patterns it returns instantly from a local catalog (no LLM call burned).
              </li>
              <li>
                <strong>Copy for chat</strong> is the manual fallback if you want to ask in chat directly.
              </li>
            </ol>
          </section>
        </>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone: 'amber' | 'emerald' | 'red' | 'slate'
}) {
  const colors: Record<typeof tone, string> = {
    amber: 'border-amber-200 bg-amber-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    red: 'border-red-200 bg-red-50',
    slate: 'border-slate-200 bg-slate-50',
  }
  return (
    <div className={`rounded-xl border p-3 ${colors[tone]}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  )
}

function SeverityPill({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    transient: 'bg-amber-50 text-amber-700 border-amber-200',
    permanent: 'bg-red-50 text-red-700 border-red-200',
    unknown: 'bg-slate-100 text-slate-700 border-slate-300',
  }
  const cls = map[severity] ?? map.unknown
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {severity}
    </span>
  )
}

function SuggestionCard({ suggestion }: { suggestion: AISuggestion }) {
  const colorByClass: Record<typeof suggestion.classification, string> = {
    transient: 'border-amber-300 bg-amber-50/60',
    permanent: 'border-red-300 bg-red-50/60',
    unclear: 'border-slate-300 bg-slate-50/60',
  }
  return (
    <div className={`rounded-lg border p-3 text-xs space-y-2 ${colorByClass[suggestion.classification]}`}>
      <div className="flex items-center gap-2 font-semibold">
        <Sparkles className="w-3.5 h-3.5" />
        AI suggestion (review before shipping)
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Classification</div>
          <div className="font-mono">{suggestion.classification}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Suggested tag</div>
          <div className="font-mono">{suggestion.classifier_tag}</div>
        </div>
      </div>
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Suggested regex</div>
        <code className="block bg-white border border-slate-200 rounded p-1.5 mt-1 text-[11px] font-mono break-all">
          {suggestion.regex_pattern || '(none)'}
        </code>
      </div>
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Rationale</div>
        <p className="mt-1">{suggestion.rationale}</p>
      </div>
      {suggestion.needs_code_change && suggestion.code_change_summary && (
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Suggested code change</div>
          <p className="mt-1">{suggestion.code_change_summary}</p>
        </div>
      )}
    </div>
  )
}
