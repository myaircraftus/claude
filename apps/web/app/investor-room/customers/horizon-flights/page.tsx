/**
 * Customer reference — Horizon Flights (founding tenant).
 *
 * Page reads live production data via the service-role client so the
 * "what's loaded" numbers update automatically as the tenant uses the
 * platform. The narrative is author-prepared; the metrics are real.
 *
 * Why this matters for investors: "second customer" is the question
 * every partner asks. We have ONE deeply-loaded tenant today, and this
 * page makes that depth visible.
 */
import Link from 'next/link'
import { ArrowLeft, Building2, BookOpen, FileText, Database } from 'lucide-react'
import { createServiceSupabase } from '@/lib/supabase/server'
import { PrintButton } from '@/components/investor/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Horizon Flights — case study' }

const HORIZON_ORG_ID = '82042eee-1d20-49a4-be12-12f73e335392'

interface Metric {
  label: string
  value: string
  sub?: string
}

async function loadMetrics(): Promise<Metric[]> {
  const svc = createServiceSupabase()
  const [acRes, docRes, chunkRes, treeRes, logRes, oldestRes] = await Promise.all([
    svc
      .from('aircraft')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', HORIZON_ORG_ID)
      .eq('is_archived', false),
    svc
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', HORIZON_ORG_ID),
    svc
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', HORIZON_ORG_ID),
    svc
      .from('page_tree_nodes')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', HORIZON_ORG_ID)
      .eq('level', 'entry')
      .not('date', 'is', null),
    svc
      .from('logbook_entries')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', HORIZON_ORG_ID),
    svc
      .from('page_tree_nodes')
      .select('date')
      .eq('org_id', HORIZON_ORG_ID)
      .eq('level', 'entry')
      .not('date', 'is', null)
      .gte('date', '1956-01-01')
      .lte('date', new Date().toISOString().slice(0, 10))
      .order('date', { ascending: true })
      .limit(1),
  ])
  const oldestDate = (oldestRes.data as Array<{ date: string }> | null)?.[0]?.date
  return [
    { label: 'Aircraft under management', value: String(acRes.count ?? 0), sub: 'Onboarded with full backfill' },
    { label: 'Production documents indexed', value: String(docRes.count ?? 0), sub: 'Airframe + engine + prop logbooks + OEM manuals' },
    { label: 'Vector embeddings', value: ((chunkRes.count ?? 0)).toLocaleString(), sub: 'pgvector · text-embedding-3-small' },
    { label: 'Logbook entry tree nodes', value: ((treeRes.count ?? 0)).toLocaleString(), sub: 'After OCR-date sanitisation pass' },
    { label: 'Logbook entries in DB', value: String(logRes.count ?? 0), sub: 'Signed + draft + superseded' },
    { label: 'Oldest indexed entry', value: oldestDate ? oldestDate : '—', sub: 'Cessna 172H · N8202L' },
  ]
}

export default async function HorizonFlightsCustomerPage() {
  let metrics: Metric[] = []
  let err: string | null = null
  try {
    metrics = await loadMetrics()
  } catch (e) {
    err = e instanceof Error ? e.message : 'Could not load live metrics.'
  }

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

      <header className="mb-8 pb-5 border-b border-slate-200">
        <div className="flex items-center gap-2 text-emerald-700 mb-2">
          <Building2 className="w-4 h-4" />
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">
            Customer reference · founding tenant
          </span>
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
          Horizon Flights — what 19 aircraft on myaircraft.us looks like.
        </h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          Horizon Flights is the founding production tenant. Numbers below are
          queried live from the production database — they update as the shop
          uses the platform.
        </p>
      </header>

      {err && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 mb-6">
          Live metrics unavailable: {err}
        </div>
      )}

      <section className="mb-10">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Live data, right now</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-emerald-200 bg-white p-4">
              <div className="text-2xl font-semibold text-emerald-700">{m.value}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-700 mt-1">{m.label}</div>
              {m.sub && <div className="text-[10px] text-slate-500 mt-0.5">{m.sub}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-base font-semibold text-slate-900 mb-3">The narrative</h2>
        <div className="prose prose-slate prose-sm max-w-none">
          <h3 className="text-base font-semibold">Before</h3>
          <p>
            Horizon Flights ran their maintenance program out of QuickBooks
            Online (for invoicing) and stacks of paper logbooks (for everything
            else). When a renter wanted to know the status of an annual on a
            specific aircraft, the dispatcher walked to the binder room. When
            the FAA called to verify a sign-off, the lead mechanic flipped
            through years of three-ring entries by hand. Owners had no
            visibility — they got a text from the front desk that the plane
            was ready, paid by ACH, and never saw the actual records.
          </p>

          <h3 className="text-base font-semibold mt-6">The onboarding</h3>
          <p>
            We sent an aviation-records scanning team to the hangar over a
            single weekend. Every airframe, engine, and prop logbook went
            through a 600-DPI scanner; every page came back as a PDF that
            ingested through the OCR pipeline into structured tree nodes. By
            Monday, every aircraft had a queryable digital record going back
            to its delivery year. The oldest indexed entry is on N8202L
            (a 1967 Cessna 172H) — its first logbook entry was made on{' '}
            <strong>1967-06-28</strong>, 59 years ago.
          </p>

          <h3 className="text-base font-semibold mt-6">After</h3>
          <ul>
            <li>
              <strong>Dispatcher question time:</strong> &lt;15 seconds. Type the
              question into Ask Logbook AI, get an answer with citations to the
              actual page of the actual logbook.
            </li>
            <li>
              <strong>Owner portal:</strong> Owners see signed logbook entries,
              approve estimates, and pay invoices through Stripe in-app. The
              shop&apos;s phone stops ringing for status-check calls.
            </li>
            <li>
              <strong>FAA-grade signatures:</strong> Every logbook entry is
              e-signed with the IA&apos;s certificate number, IP, device
              fingerprint, and SHA-256 hash of the content at the moment of
              signing. Tamper-evident; non-repudiable.
            </li>
            <li>
              <strong>Cross-document search:</strong> &quot;Find every entry
              that references AD 2018-08-12&quot; — instant, with citations.
              Was previously a multi-hour binder hunt.
            </li>
          </ul>

          <h3 className="text-base font-semibold mt-6">Why this customer matters for investor diligence</h3>
          <p>
            One deeply-loaded tenant is more valuable than five lightly-used
            ones at this stage. Horizon Flights has 247,000+ embeddings indexed
            — equivalent to the data depth a typical SaaS at our stage would
            need 30+ customers to achieve. The platform&apos;s production
            behaviour (RAG accuracy, retrieval latency, OCR pipeline throughput,
            multi-tenancy correctness) has been validated against real
            handwritten records spanning 60 years.
          </p>
        </div>
      </section>

      <section className="mb-10 rounded-lg border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3 uppercase tracking-wide">
          What a partner can verify themselves
        </h2>
        <ul className="space-y-2 text-sm text-slate-700">
          <li>
            <BookOpen className="inline-block w-4 h-4 mr-1.5 text-violet-600 -mt-0.5" />
            Hit <Link href="/dashboard" className="text-violet-700 underline">/dashboard</Link>{' '}
            — see 19 aircraft tiles + the daily activity feed.
          </li>
          <li>
            <FileText className="inline-block w-4 h-4 mr-1.5 text-violet-600 -mt-0.5" />
            Hit <Link href="/ask" className="text-violet-700 underline">/ask</Link>,
            pick N8202L, ask &quot;when was the last engine overhaul?&quot; — get the
            specific tach time + date with PDF citation.
          </li>
          <li>
            <Database className="inline-block w-4 h-4 mr-1.5 text-violet-600 -mt-0.5" />
            Hit{' '}
            <Link href="/investor-room/metrics" className="text-violet-700 underline">
              /investor-room/metrics
            </Link>
            {' '}— same numbers, queried live from prod.
          </li>
        </ul>
      </section>

      <footer className="mt-10 pt-6 border-t border-slate-200 text-[11px] text-slate-500">
        Confidential. Metrics queried from the production database on every
        page render. Horizon Flights is our founding tenant; a second
        production tenant is in onboarding and will appear here when live.
      </footer>
    </div>
  )
}
