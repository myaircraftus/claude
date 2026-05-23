/**
 * Cap table — pre- and post-money for the proposed $2.5M seed on a
 * $15M post-money cap. Shows the dilution waterfall plus the option
 * pool refresh.
 */
import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { PrintButton } from '@/components/investor/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cap table' }

// Cap-table model
//
// Pre-money:
//   Founder (Andy Patel) — common stock — 8,000,000
//   ESOP pool (unallocated)            — 2,000,000   (20% reserved)
//   Total pre-money                     — 10,000,000 shares
//
// Round:
//   $2.5M raised at $15M post-money cap.
//   New shares = $2.5M / ($15M / 10M shares) = 1,666,666 shares (~14.3% post)
//   Pre-money valuation = $12.5M
//
// Post-money:
//   Founder      — 8,000,000 (68.6%)
//   ESOP         — 2,000,000 (17.1%) — refresh in same round if needed
//   New investors — 1,666,666 (14.3%)
//   Total         — 11,666,666

interface Holder {
  name: string
  type: 'founder' | 'esop' | 'investor'
  pre: number
  post: number
  newMoney?: number
}

const HOLDERS: Holder[] = [
  { name: 'Andy Patel (founder)', type: 'founder', pre: 8_000_000, post: 8_000_000 },
  { name: 'Employee option pool (ESOP)', type: 'esop', pre: 2_000_000, post: 2_000_000 },
  {
    name: 'Seed investors (new round)',
    type: 'investor',
    pre: 0,
    post: 1_666_666,
    newMoney: 2_500_000,
  },
]

const PRE_TOTAL = HOLDERS.reduce((s, h) => s + h.pre, 0)
const POST_TOTAL = HOLDERS.reduce((s, h) => s + h.post, 0)
const PRE_MONEY_VALUATION = 12_500_000
const POST_MONEY_VALUATION = 15_000_000

function fmtNum(n: number): string {
  return n.toLocaleString()
}
function fmtPct(num: number, den: number): string {
  return den === 0 ? '—' : `${((num / den) * 100).toFixed(1)}%`
}
function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

export default function CapTablePage() {
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
        <div className="flex items-center gap-2 text-violet-700 mb-2">
          <Users className="w-4 h-4" />
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">
            Cap table · seed round
          </span>
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
          $2.5M on $15M post.
        </h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          Pre-money $12.5M with a 20% ESOP carved out. New seed investors take
          14.3% post. Founder dilution from 80% → 68.6%. Standard NVCA-style
          terms; full term sheet on request after first call.
        </p>
      </header>

      <section className="mb-10">
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-[0.1em] text-[11px]">
              <tr>
                <th className="text-left px-4 py-3 border-b border-slate-200 font-semibold">Holder</th>
                <th className="text-right px-4 py-3 border-b border-slate-200 font-semibold">Pre-money shares</th>
                <th className="text-right px-4 py-3 border-b border-slate-200 font-semibold">Pre-money %</th>
                <th className="text-right px-4 py-3 border-b border-slate-200 font-semibold">New $</th>
                <th className="text-right px-4 py-3 border-b border-slate-200 font-semibold">Post-money shares</th>
                <th className="text-right px-4 py-3 border-b border-slate-200 font-semibold">Post-money %</th>
              </tr>
            </thead>
            <tbody>
              {HOLDERS.map((h, i) => (
                <tr key={h.name} className={i > 0 ? 'border-t border-slate-100' : ''}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{h.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">
                      {h.type === 'founder' ? 'Common stock' : h.type === 'esop' ? 'Reserved for hires' : 'SAFE / preferred'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmtNum(h.pre)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtPct(h.pre, PRE_TOTAL)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{h.newMoney ? fmtUSD(h.newMoney) : '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-900 font-medium">{fmtNum(h.post)}</td>
                  <td className="px-4 py-3 text-right text-violet-700 font-semibold">
                    {fmtPct(h.post, POST_TOTAL)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td className="px-4 py-3 font-semibold text-slate-900">Total</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmtNum(PRE_TOTAL)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">100.0%</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmtUSD(2_500_000)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmtNum(POST_TOTAL)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">100.0%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Valuation summary */}
      <section className="mb-10 grid grid-cols-1 md:grid-cols-4 gap-3">
        <ValuationCard label="Round size" value={fmtUSD(2_500_000)} />
        <ValuationCard label="Pre-money valuation" value={fmtUSD(PRE_MONEY_VALUATION)} />
        <ValuationCard label="Post-money valuation" value={fmtUSD(POST_MONEY_VALUATION)} accent />
        <ValuationCard label="Price per share" value={`$${(PRE_MONEY_VALUATION / PRE_TOTAL).toFixed(2)}`} />
      </section>

      {/* Notes */}
      <section className="mb-10 rounded-lg border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Notes</h2>
        <ul className="space-y-2 text-sm text-slate-700">
          <li>
            <strong>Instrument:</strong> SAFE on $15M post-money cap OR priced
            Series Seed at $12.5M pre. Investor's choice.
          </li>
          <li>
            <strong>Option pool:</strong> 20% ESOP pre-money — refreshed in the
            round so founder dilution is on round investors and ESOP both.
          </li>
          <li>
            <strong>Pro-rata:</strong> Standard pro-rata on Series A. No
            super-pro-rata.
          </li>
          <li>
            <strong>Board:</strong> 3-seat board (founder + lead investor + 1
            independent) post-Series A. Seed round = founder-controlled.
          </li>
          <li>
            <strong>Vesting:</strong> Founder shares already vested through
            bootstrap period; new ESOP grants on standard 4-year vest with 1-year
            cliff.
          </li>
          <li>
            <strong>Information rights:</strong> Quarterly financials and KPI
            report to investors holding ≥$100K.
          </li>
        </ul>
      </section>

      <footer className="pt-6 border-t border-slate-200 text-[11px] text-slate-500">
        Confidential. This cap-table view is the high-level summary; the
        spreadsheet detail (with vesting schedules, 409A history, and
        dilution waterfall) is in the Data Room under "Cap table (.xlsx)".
      </footer>
    </div>
  )
}

function ValuationCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        accent
          ? 'border-violet-300 bg-violet-50'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-slate-600 mb-1">{label}</div>
      <div
        className={`text-2xl font-semibold ${accent ? 'text-violet-700' : 'text-slate-900'}`}
      >
        {value}
      </div>
    </div>
  )
}
