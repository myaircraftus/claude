/**
 * Use of Funds — where the $2.5M goes and what milestones each tranche
 * unlocks. Investors care about this as much as they care about the
 * valuation — it's the answer to "show me the runway."
 */
import Link from 'next/link'
import { ArrowLeft, Wallet, Code, Megaphone, ShieldCheck, Wrench } from 'lucide-react'
import { PrintButton } from '@/components/investor/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Use of funds' }

interface Bucket {
  pct: number
  label: string
  amount: number
  icon: typeof Code
  color: string
  detail: string[]
  hires: string[]
  milestone: string
}

const TOTAL = 2_500_000

const BUCKETS: Bucket[] = [
  {
    pct: 55,
    label: 'Engineering & product',
    amount: TOTAL * 0.55,
    icon: Code,
    color: 'violet',
    detail: [
      'Senior staff engineer (multi-tenant systems)',
      'Founding A&P mechanic-in-residence',
      'Senior product designer (FT after contract)',
      'Continued founder eng on platform + AI',
    ],
    hires: [
      'Senior staff eng: $200-250K + 0.5-1.0%',
      'A&P mechanic-in-residence: $120-160K + 0.25-0.5%',
      'Product designer: $140-180K + 0.25%',
    ],
    milestone: 'Marketplace v1 ships · iOS PWA owner app · Approval evidence PDF',
  },
  {
    pct: 25,
    label: 'Go-to-market',
    amount: TOTAL * 0.25,
    icon: Megaphone,
    color: 'amber',
    detail: [
      'GTM lead hire with GA shop network',
      'AOPA Summit + EAA AirVenture booth & sponsorship',
      'Regional FAA conference circuit',
      'Founding-customer success motion',
      'Content + SEO + case studies',
    ],
    hires: ['GTM lead: $160K + variable + 0.5-1.0%'],
    milestone: '50 paying shops by end of runway · NRR > 100%',
  },
  {
    pct: 10,
    label: 'SOC2 audit + pen test',
    amount: TOTAL * 0.10,
    icon: ShieldCheck,
    color: 'emerald',
    detail: [
      'SOC2 Type II audit engagement (Drata + audit firm)',
      'External pen test (Cobalt or similar)',
      'GRC tooling (Vanta or Drata for continuous monitoring)',
      'Annual vendor security questionnaire support',
    ],
    hires: [],
    milestone: 'SOC2 Type II report in hand · Pen-test report on file',
  },
  {
    pct: 10,
    label: 'Reserve / opportunistic',
    amount: TOTAL * 0.10,
    icon: Wrench,
    color: 'slate',
    detail: [
      'Type-club partnership pilots (Cirrus Owners / COPA / ABS)',
      'White-label proof-of-concept with one regional MRO franchise',
      'Unplanned hire if pipeline accelerates',
      'Cushion for AI-cost regime change',
    ],
    hires: [],
    milestone: '≥1 type-club partnership signed',
  },
]

function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

export default function UseOfFundsPage() {
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
        <div className="flex items-center gap-2 text-amber-700 mb-2">
          <Wallet className="w-4 h-4" />
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">
            $2.5M · 18 months runway
          </span>
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
          Where the $2.5M goes.
        </h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          18-month runway from close. Each tranche is tied to a milestone, not
          just a hire. By the end of the runway we should be at 50 paying shops,
          SOC2 Type II in hand, marketplace v1 live, and Series-A profile.
        </p>
      </header>

      {/* Visual stacked bar */}
      <section className="mb-8">
        <div className="flex h-12 rounded-lg overflow-hidden shadow-sm">
          {BUCKETS.map((b) => {
            const color =
              b.color === 'violet'
                ? 'bg-violet-500'
                : b.color === 'amber'
                  ? 'bg-amber-500'
                  : b.color === 'emerald'
                    ? 'bg-emerald-500'
                    : 'bg-slate-500'
            return (
              <div
                key={b.label}
                style={{ width: `${b.pct}%` }}
                className={`${color} text-white text-xs font-semibold flex items-center justify-center`}
                title={`${b.label}: ${b.pct}%`}
              >
                {b.pct}%
              </div>
            )
          })}
        </div>
        <div className="flex justify-between mt-2 text-[11px] text-slate-500">
          {BUCKETS.map((b) => (
            <span key={b.label} style={{ width: `${b.pct}%` }} className="text-center">
              {b.label}
            </span>
          ))}
        </div>
      </section>

      {/* Detail cards */}
      <section className="space-y-4">
        {BUCKETS.map((b) => {
          const Icon = b.icon
          const tint =
            b.color === 'violet'
              ? 'border-violet-200 bg-violet-50/40 text-violet-700'
              : b.color === 'amber'
                ? 'border-amber-200 bg-amber-50/40 text-amber-700'
                : b.color === 'emerald'
                  ? 'border-emerald-200 bg-emerald-50/40 text-emerald-700'
                  : 'border-slate-200 bg-slate-50/40 text-slate-700'
          return (
            <div key={b.label} className={`rounded-lg border ${tint} p-5`}>
              <div className="flex items-start gap-4 mb-3">
                <div className="shrink-0">
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1 gap-4">
                    <h2 className="text-lg font-semibold text-slate-900">{b.label}</h2>
                    <div className="text-right">
                      <div className="text-2xl font-semibold text-slate-900">{fmtUSD(b.amount)}</div>
                      <div className="text-[11px] text-slate-500">{b.pct}% of round</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2">
                    Spend detail
                  </h3>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {b.detail.map((d) => (
                      <li key={d} className="flex items-start gap-1.5">
                        <span className="text-slate-400 mt-0.5">·</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  {b.hires.length > 0 && (
                    <>
                      <h3 className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2">
                        Hires (incl. equity)
                      </h3>
                      <ul className="space-y-1 text-sm text-slate-700 mb-4">
                        {b.hires.map((h) => (
                          <li key={h} className="flex items-start gap-1.5">
                            <span className="text-slate-400 mt-0.5">·</span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <h3 className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2">
                    Milestone unlocked
                  </h3>
                  <div className="text-sm font-medium text-slate-900">{b.milestone}</div>
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {/* End-of-runway profile */}
      <section className="mt-10 rounded-lg border-2 border-violet-300 bg-gradient-to-br from-violet-50/60 to-white p-6">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-violet-700 font-semibold mb-2">
          End-of-runway profile
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div>
            <div className="text-2xl font-semibold text-violet-700">50</div>
            <div className="text-[11px] text-slate-600 uppercase tracking-wider mt-1">
              Paying shops
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-violet-700">$1.8M</div>
            <div className="text-[11px] text-slate-600 uppercase tracking-wider mt-1">
              Year-1 ARR
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-emerald-700">SOC2</div>
            <div className="text-[11px] text-slate-600 uppercase tracking-wider mt-1">
              Type II report
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-amber-700">Series A</div>
            <div className="text-[11px] text-slate-600 uppercase tracking-wider mt-1">
              Ready to raise
            </div>
          </div>
        </div>
        <p className="text-sm text-slate-700 mt-5">
          At month 18 we should be positioned for an $8-12M Series A on
          $40-60M post — exactly what a vertical-SaaS growth investor wants
          to see. The market is real, the unit economics are clean, and the
          regulatory moat is documented.
        </p>
      </section>

      <footer className="mt-10 pt-6 border-t border-slate-200 text-[11px] text-slate-500">
        Confidential. Subject to change based on investor preferences and
        market conditions through close. Final spend allocation set in
        board-approved annual budget.
      </footer>
    </div>
  )
}
