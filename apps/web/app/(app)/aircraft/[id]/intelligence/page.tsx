// Aircraft Intelligence — index. Shows all 10 AI modules grouped into
// Analysis + Insights, with per-module cache status. Owner + admin only;
// the shop persona sees a request-access message.
import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { Topbar } from '@/components/shared/topbar'
import {
  History, ClipboardCheck, ShieldCheck, AlertTriangle, Repeat, CalendarClock,
  DollarSign, FileText, Search, Scale, Brain, Lock, ArrowRight,
} from 'lucide-react'
import type { IntelligenceModule } from '@/lib/intelligence/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Aircraft Intelligence' }

interface ModuleDef {
  key: IntelligenceModule
  title: string
  desc: string
  icon: typeof History
  /** component-search is real-time — it is never cached. */
  realtime?: boolean
}

const ANALYSIS: ModuleDef[] = [
  { key: 'history', title: 'Full History Package', icon: History,
    desc: 'A complete, source-cited maintenance history — identity, timeline, ADs, damage, status.' },
  { key: 'prebuy', title: 'Prebuy Report', icon: ClipboardCheck,
    desc: 'A neutral, flags-focused pre-purchase evaluation with a GREEN / YELLOW / RED risk score.' },
  { key: 'ad-traceability', title: 'AD / SB Traceability', icon: ShieldCheck,
    desc: 'Every Airworthiness Directive mapped to its compliance evidence, with recurring due dates.' },
  { key: 'missing-records', title: 'Missing Records Detector', icon: AlertTriangle,
    desc: 'Gaps and anomalies that suggest records are missing — annual gaps, tach jumps, lost logbooks.' },
]

const INSIGHTS: ModuleDef[] = [
  { key: 'squawk-patterns', title: 'Recurring Squawk Patterns', icon: Repeat,
    desc: 'Problems that keep coming back — the underlying issue behind repeat squawks.' },
  { key: 'maintenance-forecast', title: 'Maintenance Forecast', icon: CalendarClock,
    desc: 'What maintenance is coming due and when, with an estimated 12-month budget.' },
  { key: 'market-value', title: 'Market Value Estimate', icon: DollarSign,
    desc: 'An AI value-range estimate from specs, times, and record quality — not an appraisal.' },
  { key: 'lender-summary', title: 'Lender / Insurance Summary', icon: FileText,
    desc: 'A clean, exportable summary package lenders and underwriters ask for.' },
  { key: 'component-search', title: 'Component History Search', icon: Search,
    desc: 'Search the whole record history for any part number, system, or topic.', realtime: true },
  { key: 'time-comparison', title: 'Airframe / Engine / Prop Comparison', icon: Scale,
    desc: 'Compare airframe, engine, and prop times against TBO limits and each other.' },
]

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default async function AircraftIntelligencePage({ params }: { params: { id: string } }) {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  let persona: 'owner' | 'shop' | 'admin' = 'owner'
  try {
    persona = (await getCurrentPersona()).persona
  } catch {
    // defensive — page already requires a session
  }

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!aircraft) redirect('/aircraft')
  const ac = aircraft as { id: string; tail_number: string; make: string | null; model: string | null }

  // Latest cache timestamp per module for this aircraft.
  const lastRun = new Map<string, string>()
  const { data: cacheRows } = await supabase
    .from('intelligence_cache')
    .select('module, generated_at')
    .eq('aircraft_id', ac.id)
    .order('generated_at', { ascending: false })
  for (const row of (cacheRows ?? []) as Array<{ module: string; generated_at: string }>) {
    if (!lastRun.has(row.module)) lastRun.set(row.module, row.generated_at)
  }

  function renderGroup(label: string, modules: ModuleDef[]) {
    return (
      <div>
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2" style={{ fontWeight: 700 }}>
          {label}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {modules.map((m) => {
            const Icon = m.icon
            const run = lastRun.get(m.key)
            return (
              <Link
                key={m.key}
                href={`/aircraft/${ac.id}/intelligence/${m.key}`}
                className="group rounded-xl border border-border bg-white p-4 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[13.5px] text-foreground" style={{ fontWeight: 600 }}>
                      {m.title}
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
                    </div>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">{m.desc}</p>
                    <p className="text-[10.5px] text-muted-foreground/70 mt-1.5">
                      {m.realtime ? 'Real-time search' : run ? `Last run ${timeAgo(run)}` : 'Not yet run'}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: ac.tail_number, href: `/aircraft/${ac.id}` },
          { label: 'Intelligence' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
                Aircraft Intelligence
              </h1>
              <p className="text-[12px] text-muted-foreground">
                {ac.tail_number}
                {[ac.make, ac.model].filter(Boolean).length > 0
                  ? ` · ${[ac.make, ac.model].filter(Boolean).join(' ')}`
                  : ''}
                {' '}— 10 AI analyses over this aircraft&apos;s uploaded records.
              </p>
            </div>
          </div>

          {persona === 'shop' ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
                <Lock className="h-6 w-6 text-amber-500" />
              </div>
              <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                Aircraft Intelligence is owner-only
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                These analysis reports run over the owner&apos;s private aircraft records.
                Request access from the aircraft owner to view them.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {renderGroup('Analysis', ANALYSIS)}
              {renderGroup('Insights', INSIGHTS)}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
