'use client'

/**
 * AIAnalysisCard (Spec 7.6) — owner-facing 3-section AI summary.
 *
 * Lazy-fetches the cached analysis on mount; if older than 24h the card
 * shows "Refresh available" + the timestamp. Refresh button POSTs to the
 * route which calls Claude Sonnet, persists output to ai_activity_log,
 * and returns the structured JSON.
 *
 * Mounts inside EconomicsView (Sprint 7.5) above the charts.
 */

import { useCallback, useEffect, useState } from 'react'
import { Sparkles, RefreshCw, Loader2, Lightbulb, AlertCircle, ListChecks, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Analysis {
  headline: string
  observations: string[]
  recommendations: string[]
  period_label: string
  model_used: string
  generated_at: string
  input_tokens: number
  output_tokens: number
  cost_usd_cents: number | null
}

interface Props {
  aircraftId: string
}

interface FetchResp {
  analysis: Analysis | null
  fresh: boolean
  generated_at?: string
  error?: string
}

function fmtCents(cents: number | null): string {
  if (cents == null) return '—'
  if (cents < 100) return `${cents}¢`
  return `$${(cents / 100).toFixed(2)}`
}

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}

export function AIAnalysisCard({ aircraftId }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [fresh, setFresh] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadCached = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/analysis`)
      const json = (await res.json()) as FetchResp
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`)
      } else {
        setAnalysis(json.analysis ?? null)
        setFresh(json.fresh)
        setGeneratedAt(json.generated_at ?? json.analysis?.generated_at ?? null)
        setError(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [aircraftId])

  useEffect(() => { void loadCached() }, [loadCached])

  async function generate() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/analysis`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ period: '365d' }),
      })
      const json = (await res.json()) as FetchResp
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`)
      } else if (json.analysis) {
        setAnalysis(json.analysis)
        setFresh(true)
        setGeneratedAt(json.generated_at ?? json.analysis.generated_at)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-[14px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            AI analysis
          </h3>
          {analysis && (
            <span className={cn(
              'inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border',
              fresh ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200',
            )} style={{ fontWeight: 700 }}>
              {fresh ? 'Fresh' : 'Stale'}
            </span>
          )}
          {generatedAt && (
            <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
              <Clock className="h-3 w-3" /> {fmtAge(generatedAt)}
            </span>
          )}
        </div>
        <Button size="sm" onClick={() => void generate()} disabled={running}>
          {running ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          {analysis ? 'Refresh' : 'Generate analysis'}
        </Button>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800 flex gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {loading ? (
        <div className="text-[12px] text-muted-foreground py-6 text-center">
          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" /> Loading…
        </div>
      ) : !analysis ? (
        <div className="text-[12px] text-muted-foreground py-6 text-center">
          No analysis yet. Click <strong>Generate analysis</strong> for a 3-paragraph plain-English summary based on the last 12 months of cost data.
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[14px] text-foreground leading-relaxed">
            {analysis.headline}
          </p>

          {analysis.observations.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
                <Lightbulb className="h-3 w-3" /> Observations
              </div>
              <ul className="space-y-1">
                {analysis.observations.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] text-foreground">
                    <span className="text-muted-foreground">·</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.recommendations.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
                <ListChecks className="h-3 w-3" /> Recommendations
              </div>
              <ul className="space-y-1">
                {analysis.recommendations.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] text-foreground">
                    <span className="text-muted-foreground">·</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-[10.5px] text-muted-foreground/80 font-mono pt-2 border-t border-border">
            {analysis.model_used} · {analysis.input_tokens}↓/{analysis.output_tokens}↑ tokens · {fmtCents(analysis.cost_usd_cents)} · {analysis.period_label} lookback
          </div>
        </div>
      )}
    </div>
  )
}
