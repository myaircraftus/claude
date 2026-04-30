'use client'

/**
 * /admin/ingestion-health — top-of-funnel for keeping the ingestion
 * pipeline at zero failures. Surfaces:
 *   - 24h / 7d failure totals + recovery rate
 *   - Per-classifier-tag rollup (which categories of failure are happening)
 *   - List of "unknown" classifier rows (NEW patterns we haven't taught the
 *     auto-heal system about yet)
 *   - "Get AI suggestion" button per unknown — calls the LLM endpoint to
 *     propose a classification + regex + rationale for human review.
 *
 * Nothing on this page applies a fix automatically. The whole point of the
 * AI suggestion piece is to give the admin (and Claude) a high-confidence
 * starting point for a code change we then ship deliberately.
 */

import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, CheckCircle2, Sparkles, RefreshCw } from 'lucide-react'

interface TagSummary {
  tag: string
  severity: string
  total_7d: number
  last_24h: number
  recovered: number
  failed_open: number
  gave_up: number
  last_occurred_at: string | null
  sample_message: string | null
}

interface UnknownRow {
  document_id: string
  occurred_at: string
  error_message: string
  outcome: string
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
  recent_unknowns: UnknownRow[]
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
  const [suggestionsByDoc, setSuggestionsByDoc] = useState<
    Record<string, { loading: boolean; result?: AISuggestion; error?: string }>
  >({})

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function requestSuggestion(unknown: UnknownRow) {
    const key = unknown.document_id + ':' + unknown.occurred_at
    setSuggestionsByDoc((prev) => ({ ...prev, [key]: { loading: true } }))
    try {
      const res = await fetch('/api/admin/ingestion-health/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error_message: unknown.error_message,
          document_id: unknown.document_id,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      setSuggestionsByDoc((prev) => ({
        ...prev,
        [key]: { loading: false, result: json.suggestion as AISuggestion },
      }))
    } catch (err) {
      setSuggestionsByDoc((prev) => ({
        ...prev,
        [key]: { loading: false, error: err instanceof Error ? err.message : String(err) },
      }))
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ingestion Health</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-recovery telemetry for the document ingestion pipeline. Use this to spot recurring patterns and convert
            unknown failure modes into known auto-recoverable ones.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs hover:bg-muted/30 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

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

          {/* Per-tag rollup */}
          <section className="rounded-xl border border-border bg-white">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">Failure categories (last 7 days)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sorted by 24h volume. Anything in <code className="font-mono text-[11px]">unknown</code> needs a one-time fix
                to add to the classifier.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 border-b border-border">
                  <tr className="text-left">
                    <th className="px-4 py-2 font-medium text-muted-foreground uppercase tracking-wide">Tag</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground uppercase tracking-wide">Severity</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground uppercase tracking-wide text-right">24h</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground uppercase tracking-wide text-right">7d</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground uppercase tracking-wide text-right">Recovered</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground uppercase tracking-wide text-right">Gave up</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground uppercase tracking-wide">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.by_tag.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                        No failures in the last 7 days. Pipeline is healthy.
                      </td>
                    </tr>
                  )}
                  {data.by_tag.map((row) => (
                    <tr key={row.tag} className={row.tag === 'unknown' ? 'bg-red-50/40' : ''}>
                      <td className="px-4 py-2 font-mono text-[11px]">{row.tag}</td>
                      <td className="px-4 py-2">
                        <SeverityPill severity={row.severity} />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold">{row.last_24h}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.total_7d}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{row.recovered}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-red-700">{row.gave_up}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {row.last_occurred_at ? new Date(row.last_occurred_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Unknowns — what to fix next */}
          <section className="rounded-xl border border-border bg-white">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">
                Unknown patterns
                {data.recent_unknowns.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    ({data.recent_unknowns.length} most recent — review these to add new auto-recovery rules)
                  </span>
                )}
              </h2>
            </div>
            <div className="divide-y divide-border">
              {data.recent_unknowns.length === 0 && (
                <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                  No unknown failure patterns. Every failure in the last 7 days matched a known category.
                </div>
              )}
              {data.recent_unknowns.map((u) => {
                const key = u.document_id + ':' + u.occurred_at
                const sugg = suggestionsByDoc[key]
                return (
                  <div key={key} className="px-5 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted-foreground">
                          Doc <code className="font-mono">{u.document_id.slice(0, 8)}…</code> ·{' '}
                          {new Date(u.occurred_at).toLocaleString()} · outcome:{' '}
                          <span className={u.outcome === 'recovered' ? 'text-emerald-700' : 'text-red-700'}>
                            {u.outcome}
                          </span>
                        </div>
                        <pre className="mt-1 text-[11px] bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                          {u.error_message}
                        </pre>
                      </div>
                      <button
                        onClick={() => void requestSuggestion(u)}
                        disabled={sugg?.loading}
                        className="inline-flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
                      >
                        {sugg?.loading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        Get AI suggestion
                      </button>
                    </div>

                    {sugg?.error && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                        {sugg.error}
                      </div>
                    )}

                    {sugg?.result && <SuggestionCard suggestion={sugg.result} />}
                  </div>
                )
              })}
            </div>
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
      <div className="text-[10px] text-muted-foreground italic pt-1 border-t border-slate-200">
        Nothing has been applied. Discuss this with Claude (or your engineer) and ship the actual classifier change as a
        normal commit — that&rsquo;s the safe path.
      </div>
    </div>
  )
}
