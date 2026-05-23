/**
 * One-pager — the single printable page some partners ask for.
 *
 * Designed to fit on one US Letter page when printed (print stylesheet
 * scopes margins + font sizes). Carries everything an LP-grade reader
 * needs in 60 seconds: company, market, traction, model, the ask.
 */
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { computeModel } from '@/lib/investor/financial-model'
import { PrintButton } from '@/components/investor/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'One-pager' }

export default function OnePagerPage() {
  const { years } = computeModel()
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          href="/investor-room"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Investor Room
        </Link>
        <PrintButton label="Print one-pager" />
      </div>

      <article className="bg-white print:p-0">
        {/* Header */}
        <header className="border-b-2 border-slate-900 pb-4 mb-4">
          <div className="flex items-baseline justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">myaircraft.us</h1>
              <p className="text-xs text-slate-600 mt-0.5">
                The maintenance OS for general aviation · 2026 seed round · Confidential
              </p>
            </div>
            <div className="text-right text-[10px] text-slate-500">
              Andy Patel · andy@horf.us<br />
              myaircraft.us · 2026-05-22
            </div>
          </div>
        </header>

        {/* Tagline */}
        <p className="text-sm text-slate-800 mb-4 leading-relaxed">
          We replace the paper-binder + Excel + QuickBooks stack that 90% of the 7,500
          US SMB GA maintenance shops still run on. One tenant-isolated platform for
          work orders, signed logbook entries, owner approvals, and an AI Query Engine
          that returns cited answers from your own records.
        </p>

        {/* Three-up: Problem / Solution / Moat */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Block title="Problem">
            220K US GA aircraft. 7.5K shops. $20B/yr maintenance spend. Software
            penetration &lt; 15%. The actual incumbent is paper.
          </Block>
          <Block title="Solution">
            Multi-tenant Next.js + Supabase + pgvector + Cohere rerank + GPT-4o.
            Iron-Wall persona model. FAA-grade IA e-signatures. Owner portal +
            marketplace baked in.
          </Block>
          <Block title="Moat">
            Regulatory depth (14 CFR §43/§65/§91.417 wired in) + closed-loop data +
            AI grounding + owner-portal network effect.
          </Block>
        </div>

        {/* Traction strip */}
        <div className="border border-slate-300 rounded-md p-3 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
            Traction (live as of 2026-05-22)
          </div>
          <div className="grid grid-cols-5 gap-2 text-center">
            <Stat v="19" l="Aircraft" />
            <Stat v="352" l="Docs indexed" />
            <Stat v="247K" l="Embeddings" />
            <Stat v="2,336" l="Logbook entries" />
            <Stat v="1967" l="Oldest entry year" />
          </div>
        </div>

        {/* Business model */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
              Business model
            </div>
            <ul className="text-[11px] text-slate-700 space-y-0.5">
              <li>• Per-aircraft SaaS — $299 / $899 / $1,999 per month tier</li>
              <li>• Marketplace 2.5% take rate on facilitated sales</li>
              <li>• Records-access fee $99 per buyer pull</li>
              <li>• 18% blended COGS · target 85% GM at scale · &lt;6mo CAC payback</li>
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
              3-year plan (bottoms-up model)
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-slate-600">
                  <th className="text-left font-medium">Year</th>
                  <th className="text-right font-medium">Shops</th>
                  <th className="text-right font-medium">ARR</th>
                  <th className="text-right font-medium">GM</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year} className="border-t border-slate-200">
                    <td className="text-slate-700 py-0.5">{y.year}</td>
                    <td className="text-right text-slate-900 font-medium">{y.ending_shops}</td>
                    <td className="text-right text-slate-900 font-medium">
                      {y.ending_arr >= 1_000_000
                        ? `$${(y.ending_arr / 1_000_000).toFixed(1)}M`
                        : `$${(y.ending_arr / 1_000).toFixed(0)}K`}
                    </td>
                    <td className="text-right text-emerald-700 font-medium">
                      {Math.round(y.gross_margin * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* The Ask */}
        <div className="border-2 border-violet-300 bg-violet-50/30 rounded-md p-3 mb-4">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-[11px] uppercase tracking-wider text-violet-700 font-semibold">
              The ask
            </div>
            <div className="text-[10px] text-slate-500">SAFE or priced · investor's choice</div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-2">
            <Stat v="$2.5M" l="Round size" big />
            <Stat v="$15M" l="Post-money cap" big />
            <Stat v="18 mo" l="Runway" big />
            <Stat v="50" l="Target shops" big />
          </div>
          <p className="text-[11px] text-slate-700">
            <strong>Use of funds:</strong> 55% engineering · 25% GTM · 10% SOC2 +
            pen test · 10% reserve. <strong>End-of-runway:</strong> 50 paying
            shops, $1.8M ARR, SOC2 Type II report in hand, marketplace v1 live,
            Series-A ready.
          </p>
        </div>

        {/* Why now + competition + team — 3 small columns */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Block title="Why now">
            FAA blessing digital recordkeeping since 2023. RAG good enough in 2024
            to answer logbook questions with citations. SMB shops aging out of QB.
          </Block>
          <Block title="Vs. competition">
            Not CAMP/Flightdocs (enterprise-only). Not ShopMonkey (auto). The
            real incumbent is Excel + paper.
          </Block>
          <Block title="Team">
            Founder: Andy Patel (pilot, A330 eng, full-stack). Open seats: senior
            staff eng, A&P mechanic-in-residence, GTM lead.
          </Block>
        </div>

        {/* Compliance posture */}
        <div className="border border-emerald-300 bg-emerald-50/30 rounded-md p-3 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">
            Compliance posture
          </div>
          <p className="text-[11px] text-slate-700">
            <strong>SOC2 Type II</strong> — control matrix mapped against 27 trust
            criteria (auditor engagement scheduled at seed close). <strong>RLS</strong>{' '}
            multi-tenancy at the Postgres layer, not just application code.
            <strong> Audit log</strong> immutable on every signed entry, approval,
            and payment. <strong>14 CFR</strong> recordkeeping anchors wired into
            the data model. Public:{' '}
            <span className="text-violet-700">myaircraft.us/security</span>.
          </p>
        </div>

        {/* Footer */}
        <footer className="border-t border-slate-300 pt-3 mt-4 text-[10px] text-slate-500 flex justify-between">
          <span>Confidential — do not distribute. Numbers in this one-pager match the bottoms-up model at /investor-room/financial-model.</span>
          <span>Investor Room: myaircraft.us/investor-room</span>
        </footer>
      </article>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
        {title}
      </div>
      <p className="text-[11px] text-slate-700 leading-relaxed">{children}</p>
    </div>
  )
}

function Stat({ v, l, big }: { v: string; l: string; big?: boolean }) {
  return (
    <div>
      <div className={`${big ? 'text-base font-semibold text-violet-700' : 'text-sm font-semibold text-slate-900'}`}>
        {v}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-slate-600">{l}</div>
    </div>
  )
}
