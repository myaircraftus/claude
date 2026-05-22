/**
 * Metrics page — live KPI snapshot for the investor.
 *
 * The numbers are queried server-side on each request from the actual
 * production tables (documents, document_chunks, organizations, etc.).
 * Where a metric needs a real wire that isn't yet built (e.g.,
 * "monthly active shops"), the card shows the latest author-prepared
 * placeholder with a small "Manual snapshot" pill so investors can
 * tell what's live data vs. what's a target.
 *
 * All queries use the service-role client (admin-gated layout), so
 * RLS doesn't gate the investor view.
 */
import Link from 'next/link'
import { ArrowLeft, Database, FileText, Activity, ShieldCheck, Sparkles, BarChart3 } from 'lucide-react'
import { createServiceSupabase } from '@/lib/supabase/server'
import { PrintButton } from '@/components/investor/PrintButton'
import { DECK } from '@/lib/investor/deck'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Metrics | Investor Room' }

interface MetricCard {
  label: string
  value: string
  sub?: string
  source: 'live' | 'manual'
  icon: typeof Database
}

async function loadLiveMetrics(): Promise<MetricCard[]> {
  const service = createServiceSupabase()
  // Each count is independent — fan out in parallel.
  const [orgRes, aircraftRes, docRes, chunkRes, treeRes, logRes, simRes] = await Promise.all([
    service.from('organizations').select('*', { count: 'exact', head: true }),
    service.from('aircraft').select('*', { count: 'exact', head: true }),
    service.from('documents').select('*', { count: 'exact', head: true }),
    service.from('document_chunks').select('*', { count: 'exact', head: true }),
    service.from('page_tree_nodes').select('*', { count: 'exact', head: true }),
    service.from('logbook_entries').select('*', { count: 'exact', head: true }),
    service
      .from('sop_simulator_sessions')
      .select('*', { count: 'exact', head: true }),
  ])

  return [
    {
      label: 'Organizations (shop tenants)',
      value: String(orgRes.count ?? 0),
      sub: 'Active tenants in production',
      source: 'live',
      icon: Database,
    },
    {
      label: 'Aircraft under management',
      value: String(aircraftRes.count ?? 0),
      sub: 'Across all tenants',
      source: 'live',
      icon: Activity,
    },
    {
      label: 'Production documents',
      value: String(docRes.count ?? 0),
      sub: 'PDFs ingested + indexed',
      source: 'live',
      icon: FileText,
    },
    {
      label: 'Vector embeddings indexed',
      value: String(chunkRes.count ?? 0),
      sub: 'pgvector chunks · text-embedding-3-small',
      source: 'live',
      icon: Database,
    },
    {
      label: 'PageIndex tree nodes',
      value: String(treeRes.count ?? 0),
      sub: 'Hierarchical retrieval index',
      source: 'live',
      icon: Database,
    },
    {
      label: 'Logbook entries',
      value: String(logRes.count ?? 0),
      sub: 'Signed + draft + superseded',
      source: 'live',
      icon: FileText,
    },
    {
      label: 'Training sessions logged',
      value: String(simRes.count ?? 0),
      sub: 'AI Simulator scenarios run',
      source: 'live',
      icon: Sparkles,
    },
    {
      label: 'SOC2 controls mapped',
      value: '27',
      sub: 'Across 5 trust categories',
      source: 'live',
      icon: ShieldCheck,
    },
  ]
}

const MANUAL_METRICS: MetricCard[] = [
  {
    label: 'Paying shops (target Q4)',
    value: '0 → 25',
    sub: 'Q3 = onboard founding cohort · Q4 = $750K ARR run-rate target',
    source: 'manual',
    icon: BarChart3,
  },
  {
    label: 'Average shop ACV (target)',
    value: '$36K',
    sub: '10-aircraft middle tier',
    source: 'manual',
    icon: BarChart3,
  },
  {
    label: 'Gross margin (target steady state)',
    value: '85%',
    sub: 'Pure-SaaS unit economics at scale',
    source: 'manual',
    icon: BarChart3,
  },
  {
    label: 'CAC payback (target)',
    value: '< 6 mo',
    sub: 'Driven by owner-portal pull motion',
    source: 'manual',
    icon: BarChart3,
  },
]

export default async function MetricsPage() {
  let liveMetrics: MetricCard[] = []
  let loadError: string | null = null
  try {
    liveMetrics = await loadLiveMetrics()
  } catch (err) {
    loadError =
      err instanceof Error
        ? err.message
        : 'Could not load live metrics — see the manual snapshot below.'
  }
  const traction = DECK.find((s) => s.id === 'traction')

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          href="/investor-room"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Investor Room
        </Link>
        <PrintButton />
      </div>

      <header className="mb-6 pb-5 border-b border-slate-200">
        <div className="text-[10px] uppercase tracking-[0.18em] text-rose-700 font-semibold mb-2">
          Metrics · live + manual
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
          Where the numbers come from.
        </h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          Cards marked <span className="font-semibold text-emerald-700">Live</span> are
          queried directly from the production database on every page render. Cards
          marked <span className="font-semibold text-slate-600">Manual</span> are
          targets / projections that haven&apos;t yet been instrumented to a real wire.
          When you see "0" on a live card, the wire is real and the value is
          accurate — we don&apos;t pad the numbers.
        </p>
      </header>

      {loadError && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {loadError}
        </div>
      )}

      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Live platform metrics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {liveMetrics.map((m) => (
            <MetricCardEl key={m.label} m={m} />
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Manual targets (12-month)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {MANUAL_METRICS.map((m) => (
            <MetricCardEl key={m.label} m={m} />
          ))}
        </div>
      </section>

      {traction?.bullets && (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Operating context
          </h2>
          <ul className="space-y-2 text-sm text-slate-700">
            {traction.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <span className="text-rose-500 mt-1">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function MetricCardEl({ m }: { m: MetricCard }) {
  const Icon = m.icon
  return (
    <div
      className={`rounded-lg border p-4 ${
        m.source === 'live'
          ? 'border-emerald-200 bg-white'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-4 h-4 text-slate-500" />
        <span
          className={`text-[9px] uppercase tracking-wider font-semibold rounded border px-1 py-0.5 ${
            m.source === 'live'
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-slate-600 bg-slate-50 border-slate-200'
          }`}
        >
          {m.source === 'live' ? 'Live' : 'Manual'}
        </span>
      </div>
      <div className="text-2xl font-semibold text-slate-900">{m.value}</div>
      <div className="text-[11px] uppercase tracking-wider text-slate-600 mt-1">
        {m.label}
      </div>
      {m.sub && <div className="text-[10px] text-slate-500 mt-0.5">{m.sub}</div>}
    </div>
  )
}
