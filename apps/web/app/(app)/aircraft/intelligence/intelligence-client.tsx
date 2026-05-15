'use client'

/**
 * Aircraft Intelligence — client report view.
 *
 * Aircraft selector + "Generate Intelligence Report". On generate, GETs
 * /api/aircraft/[id]/intelligence, parses the AI text into 5 sections,
 * and renders them as cards with an airworthiness badge. Refresh bypasses
 * the 1h cache with ?refresh=1.
 */

import { useState } from 'react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { Loader2, Sparkles, RefreshCw, ShieldCheck, AlertTriangle, Activity, CalendarClock, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface AircraftOption {
  id: string
  label: string
  tail: string
}

interface ParsedReport {
  airworthiness: string
  openItems: string
  trends: string
  upcoming: string
  summary: string
  raw: string
}

const SECTION_RE =
  /(?:^|\n)[ \t]*(?:#{1,6}[ \t]*)?(?:\*+[ \t]*)?(?:\d+[.)][ \t]*)?(?:\*+[ \t]*)?(AIRWORTHINESS STATUS|OPEN ITEMS|MAINTENANCE TRENDS|UPCOMING|OWNER SUMMARY)/gi

const KEY_MAP: Record<string, keyof Omit<ParsedReport, 'raw'>> = {
  'AIRWORTHINESS STATUS': 'airworthiness',
  'OPEN ITEMS': 'openItems',
  'MAINTENANCE TRENDS': 'trends',
  UPCOMING: 'upcoming',
  'OWNER SUMMARY': 'summary',
}

function cleanMarkdown(s: string): string {
  return s
    .replace(/\*\*/g, '')
    .replace(/(^|\s)[*_]([^*_\n]+)[*_]/g, '$1$2')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/`/g, '')
    .trim()
}

function parseSections(report: string): ParsedReport {
  const out: ParsedReport = {
    airworthiness: '',
    openItems: '',
    trends: '',
    upcoming: '',
    summary: '',
    raw: report,
  }
  const matches = [...report.matchAll(SECTION_RE)]
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const idx = m.index ?? 0
    const headerLineEnd = report.indexOf('\n', idx + m[0].length)
    const bodyStart = headerLineEnd === -1 ? idx + m[0].length : headerLineEnd + 1
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index ?? report.length : report.length
    const key = KEY_MAP[m[1].toUpperCase()]
    if (key) out[key] = cleanMarkdown(report.slice(bodyStart, bodyEnd))
  }
  return out
}

type Airworthiness = 'green' | 'amber' | 'red' | 'unknown'

function airworthinessFrom(text: string): Airworthiness {
  const t = text.toLowerCase()
  if (/attention\s*needed/.test(t)) return 'red'
  if (/\bmonitor\b/.test(t)) return 'amber'
  if (/airworth/.test(t)) return 'green'
  return 'unknown'
}

const STATUS_META: Record<Airworthiness, { label: string; cls: string }> = {
  green: { label: 'Airworthy', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  amber: { label: 'Monitor', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  red: { label: 'Attention Needed', cls: 'bg-red-100 text-red-800 border-red-300' },
  unknown: { label: 'Assessment', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}

export function IntelligenceClient({
  aircraft,
  selectedId,
  hasHistory,
}: {
  aircraft: AircraftOption[]
  selectedId: string
  hasHistory: boolean
}) {
  const router = useTenantRouter()
  const current = aircraft.find((a) => a.id === selectedId)
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error' | 'empty'>(
    hasHistory ? 'idle' : 'empty',
  )
  const [report, setReport] = useState<ParsedReport | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [openSquawks, setOpenSquawks] = useState<number>(0)
  const [errorMsg, setErrorMsg] = useState<string>('')

  async function generate(refresh = false) {
    setState('loading')
    setErrorMsg('')
    try {
      const res = await fetch(
        `/api/aircraft/${selectedId}/intelligence${refresh ? '?refresh=1' : ''}`,
        refresh ? { cache: 'no-store' } : undefined,
      )
      const j = await res.json().catch(() => ({}))
      if (j?.empty) {
        setState('empty')
        return
      }
      if (!res.ok || !j?.report) {
        setErrorMsg(j?.error ?? 'Unable to generate report right now. Please try again in a few minutes.')
        setState('error')
        return
      }
      setReport(parseSections(j.report as string))
      setGeneratedAt(typeof j.generatedAt === 'string' ? j.generatedAt : new Date().toISOString())
      setOpenSquawks(typeof j.openSquawkCount === 'number' ? j.openSquawkCount : 0)
      setState('done')
    } catch {
      setErrorMsg('Unable to generate report right now. Please try again in a few minutes.')
      setState('error')
    }
  }

  const status = report ? airworthinessFrom(report.airworthiness || report.raw) : 'unknown'

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      {/* Header + selector */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Aircraft Intelligence
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            An AI maintenance-health report built from logbook history, squawks, and work orders.
          </p>
        </div>
        <div>
          <Label htmlFor="ac-select" className="text-[11px] text-muted-foreground">Aircraft</Label>
          <select
            id="ac-select"
            value={selectedId}
            onChange={(e) => router.push(`/aircraft/intelligence?aircraft=${encodeURIComponent(e.target.value)}`)}
            className="mt-1 block h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {aircraft.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Empty state */}
      {state === 'empty' && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <FileText className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">No maintenance history yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Reports will be available once logbook entries are recorded for this aircraft.
          </p>
        </div>
      )}

      {/* Idle — generate */}
      {state === 'idle' && (
        <div className="rounded-2xl border border-border bg-white p-8 text-center">
          <Sparkles className="h-6 w-6 text-blue-600 mx-auto mb-2" />
          <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
            Generate an intelligence report for {current?.tail ?? 'this aircraft'}
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            AI reviews the logbook, open squawks, and recent work orders.
          </p>
          <Button onClick={() => generate(false)}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            Generate Intelligence Report
          </Button>
        </div>
      )}

      {/* Loading */}
      {state === 'loading' && (
        <div className="rounded-2xl border border-border bg-white p-12 text-center">
          <Loader2 className="h-6 w-6 text-blue-600 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
            Analyzing {current?.tail ?? 'this aircraft'}&apos;s history…
          </p>
          <p className="text-xs text-muted-foreground mt-1">This takes a few seconds.</p>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertTriangle className="h-6 w-6 text-red-600 mx-auto mb-2" />
          <p className="text-sm text-red-800" style={{ fontWeight: 600 }}>{errorMsg}</p>
          <Button variant="outline" className="mt-4" onClick={() => generate(false)}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Try again
          </Button>
        </div>
      )}

      {/* Report */}
      {state === 'done' && report && (
        <div className="space-y-4">
          {/* Card 1 — Airworthiness */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" /> Airworthiness Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm border ${STATUS_META[status].cls}`} style={{ fontWeight: 700 }}>
                {STATUS_META[status].label}
              </span>
              {report.airworthiness && (
                <p className="text-[13px] text-foreground/90 mt-3 whitespace-pre-wrap">{report.airworthiness}</p>
              )}
            </CardContent>
          </Card>

          {/* Card 2 — Open Items */}
          <SectionCard
            icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
            title="Open Items"
            body={report.openItems}
            badge={`${openSquawks} open squawk${openSquawks === 1 ? '' : 's'}`}
          />

          {/* Card 3 — Maintenance Trends */}
          <SectionCard
            icon={<Activity className="h-4 w-4 text-violet-600" />}
            title="Maintenance Trends"
            body={report.trends}
          />

          {/* Card 4 — Upcoming */}
          <SectionCard
            icon={<CalendarClock className="h-4 w-4 text-blue-600" />}
            title="Upcoming"
            body={report.upcoming}
          />

          {/* Card 5 — Owner Summary (highlighted) */}
          <div className="rounded-2xl bg-[#0c2d6b] text-white p-5">
            <div className="text-[12px] uppercase tracking-wide text-white/60 mb-1.5" style={{ fontWeight: 700 }}>
              Owner Summary
            </div>
            <p className="text-[14px] leading-relaxed whitespace-pre-wrap">
              {report.summary || report.raw}
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-muted-foreground">
              {generatedAt && `Report generated ${relativeTime(generatedAt)} · ${new Date(generatedAt).toLocaleString()}`}
            </p>
            <Button variant="outline" size="sm" onClick={() => generate(true)}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh Report
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionCard({
  icon, title, body, badge,
}: {
  icon: React.ReactNode
  title: string
  body: string
  badge?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon} {title}
          {badge && (
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border" style={{ fontWeight: 700 }}>
              {badge}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-[13px] text-foreground/90 whitespace-pre-wrap">
          {body || 'No details provided for this section.'}
        </p>
      </CardContent>
    </Card>
  )
}
