/**
 * Investor Room — landing.
 *
 * The page an investor sees first. Headline + the ask + key links into
 * pitch / business plan / data room / metrics. Conservative on chrome,
 * heavy on signal.
 */
import Link from 'next/link'
import {
  Presentation,
  BookOpen,
  FolderLock,
  BarChart3,
  Users,
  HelpCircle,
  ArrowRight,
  Sparkles,
  ShieldCheck,
} from 'lucide-react'
import { DECK } from '@/lib/investor/deck'

export const dynamic = 'force-dynamic'

export default function InvestorOverviewPage() {
  const ask = DECK.find((s) => s.id === 'ask')
  const traction = DECK.find((s) => s.id === 'traction')
  const tagline = DECK.find((s) => s.id === 'cover')?.subtitle

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <header className="mb-8">
        <div className="text-[10px] uppercase tracking-[0.2em] text-violet-700 font-semibold mb-2">
          myaircraft.us · investor room
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900 mb-3">
          The maintenance OS for general aviation.
        </h1>
        <p className="text-base text-slate-600 max-w-3xl leading-relaxed">{tagline}</p>
      </header>

      {/* Primary actions */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        <Link
          href="/investor-room/pitch"
          className="group rounded-lg border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-5 hover:shadow-sm hover:border-amber-400 transition-all"
        >
          <div className="flex items-start justify-between mb-3">
            <Presentation className="w-8 h-8 text-amber-600" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
              {DECK.length} slides
            </span>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Pitch deck</h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-3">
            Full 15-slide deck. Click <span className="font-semibold">Present</span> on the
            pitch page to drop into a full-screen presenter view.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 group-hover:text-amber-900">
            Open the deck <ArrowRight className="w-3 h-3" />
          </span>
        </Link>

        <Link
          href="/investor-room/business-plan"
          className="group rounded-lg border border-slate-200 bg-white p-5 hover:bg-slate-50 hover:border-slate-300 transition-all"
        >
          <BookOpen className="w-8 h-8 text-sky-600 mb-3" />
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Business plan</h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-3">
            Narrative + financial model. Read it like a memo, not a deck.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 group-hover:text-sky-900">
            Open <ArrowRight className="w-3 h-3" />
          </span>
        </Link>

        <Link
          href="/investor-room/data-room"
          className="group rounded-lg border border-slate-200 bg-white p-5 hover:bg-slate-50 hover:border-slate-300 transition-all"
        >
          <FolderLock className="w-8 h-8 text-emerald-600 mb-3" />
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Data room</h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-3">
            Diligence packet — financials, cap table, contracts, security
            posture, customer references.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 group-hover:text-emerald-900">
            Open <ArrowRight className="w-3 h-3" />
          </span>
        </Link>

        <Link
          href="/investor-room/metrics"
          className="group rounded-lg border border-slate-200 bg-white p-5 hover:bg-slate-50 hover:border-slate-300 transition-all"
        >
          <BarChart3 className="w-8 h-8 text-rose-600 mb-3" />
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Metrics</h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-3">
            Live KPIs — shops, aircraft, ARR, gross margin, AI usage,
            uptime, security posture.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 group-hover:text-rose-900">
            Open <ArrowRight className="w-3 h-3" />
          </span>
        </Link>

        <Link
          href="/investor-room/team"
          className="group rounded-lg border border-slate-200 bg-white p-5 hover:bg-slate-50 hover:border-slate-300 transition-all"
        >
          <Users className="w-8 h-8 text-fuchsia-600 mb-3" />
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Team</h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-3">
            Founder, builders, advisors, open seats.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-fuchsia-700 group-hover:text-fuchsia-900">
            Open <ArrowRight className="w-3 h-3" />
          </span>
        </Link>

        <Link
          href="/investor-room/faq"
          className="group rounded-lg border border-slate-200 bg-white p-5 hover:bg-slate-50 hover:border-slate-300 transition-all"
        >
          <HelpCircle className="w-8 h-8 text-cyan-600 mb-3" />
          <h2 className="text-lg font-semibold text-slate-900 mb-1">FAQ</h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-3">
            "Why now?", "Why you?", "What if Big MRO copies this?", and
            the rest of the questions every investor asks.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 group-hover:text-cyan-900">
            Open <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      </section>

      {/* The Ask card */}
      {ask && (
        <section className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/70 to-white p-8 mb-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-violet-700">
              The ask
            </span>
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">{ask.title}</h2>
          {ask.subtitle && (
            <p className="text-sm text-slate-700 mb-6 max-w-2xl">{ask.subtitle}</p>
          )}
          {ask.metrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {ask.metrics.map((m) => (
                <div key={m.label} className="rounded-lg bg-white border border-violet-100 p-4">
                  <div className="text-2xl font-semibold text-violet-700">{m.value}</div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-600 mt-1">
                    {m.label}
                  </div>
                  {m.sub && <div className="text-[10px] text-slate-500 mt-0.5">{m.sub}</div>}
                </div>
              ))}
            </div>
          )}
          {ask.bullets && (
            <ul className="space-y-2 text-sm text-slate-700">
              {ask.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <span className="text-violet-500 mt-1">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Traction snapshot */}
      {traction && traction.metrics && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Traction snapshot</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {traction.metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="text-2xl font-semibold text-slate-900">{m.value}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-600 mt-1">
                  {m.label}
                </div>
                {m.sub && <div className="text-[10px] text-slate-500 mt-0.5">{m.sub}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Compliance posture */}
      <section className="mb-10">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-5">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <h2 className="text-sm font-semibold text-emerald-800 uppercase tracking-wide">
              Compliance posture
            </h2>
          </div>
          <p className="text-sm text-slate-700 mb-3">
            SOC2 Type II preparation in progress. 27 trust criteria mapped to specific
            controls in the SOP corpus — auditor-facing matrix at{' '}
            <Link href="/sop-library/compliance" className="text-emerald-700 underline">
              /sop-library/compliance
            </Link>
            .
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-700">
            <li>• Multi-tenant Postgres with row-level security enforced at the DB</li>
            <li>• Server-only secrets · TLS 1.2+ · short-lived JWTs</li>
            <li>• Immutable audit log on every signed entry, approval, and payment</li>
            <li>• 14 CFR-aligned recordkeeping (§43, §65, §91.417)</li>
          </ul>
        </div>
      </section>

      <footer className="pt-6 border-t border-slate-200 text-[11px] text-slate-500">
        Confidential — do not distribute. Numbers in this deck are author-prepared
        for the seed round and may be updated before final delivery. Andy Patel ·
        andy@horf.us · myaircraft.us · 2026.
      </footer>
    </div>
  )
}
