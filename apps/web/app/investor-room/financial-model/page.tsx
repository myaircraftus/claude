/**
 * Financial Model — bottoms-up 3-year P&L the investor can read on
 * screen AND download as CSV. Every number is computed from the
 * assumptions block in lib/investor/financial-model.ts so anyone can
 * adjust an assumption and see the downstream impact.
 *
 * The page is intentionally honest: rev mix, gross margin trajectory,
 * cumulative burn, and the year-3 ARR landing zone.
 */
import Link from 'next/link'
import { ArrowLeft, Download, TrendingUp } from 'lucide-react'
import { computeModel, computeScenario, ASSUMPTIONS } from '@/lib/investor/financial-model'
import { PrintButton } from '@/components/investor/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Financial model' }

function usd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString()}`
}
function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`
}

export default function FinancialModelPage() {
  const { quarters, years } = computeModel()
  const a = ASSUMPTIONS

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          href="/investor-room"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Investor Room
        </Link>
        <div className="flex items-center gap-2">
          <a
            href="/api/investor/model.csv"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md px-3 py-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download CSV
          </a>
          <PrintButton />
        </div>
      </div>

      <header className="mb-8 pb-5 border-b border-slate-200">
        <div className="flex items-center gap-2 text-rose-700 mb-2">
          <TrendingUp className="w-4 h-4" />
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">
            3-year model · bottoms-up
          </span>
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
          From 1 shop to $22M ARR. The math.
        </h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          Every cell here is computed from a small block of assumptions in{' '}
          <code className="text-orange-700 bg-orange-50 border border-orange-200 px-1 rounded font-mono text-[11px]">
            lib/investor/financial-model.ts
          </code>
          . No black box. The CSV is the same data — drop into Excel and run
          your own sensitivity passes.
        </p>
      </header>

      {/* Year summary */}
      <section className="mb-10">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Annual summary</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-[0.1em] text-[11px]">
              <tr>
                <th className="text-left px-3 py-2.5 border-b border-slate-200 font-semibold">Metric</th>
                {years.map((y) => (
                  <th
                    key={y.year}
                    className="text-right px-3 py-2.5 border-b border-slate-200 font-semibold"
                  >
                    Year {y.year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="Active shops (end of year)" cells={years.map((y) => y.ending_shops.toLocaleString())} />
              <Row label="Active aircraft (end of year)" cells={years.map((y) => y.ending_aircraft.toLocaleString())} />
              <Row label="Ending ARR" cells={years.map((y) => usd(y.ending_arr))} bold />
              <Row label="Total revenue" cells={years.map((y) => usd(y.total_revenue))} bold />
              <Row label="COGS" cells={years.map((y) => usd(y.total_cogs))} dim />
              <Row label="Gross profit" cells={years.map((y) => usd(y.gross_profit))} />
              <Row
                label="Gross margin"
                cells={years.map((y) => pct(y.gross_margin))}
                tint="emerald"
              />
              <Row label="Total operating expense" cells={years.map((y) => usd(y.total_opex))} dim />
              <Row
                label="EBITDA"
                cells={years.map((y) => usd(y.ebitda))}
                bold
                tint={(y) => (years.find((yy) => yy.year === y.year)?.ebitda ?? 0) >= 0 ? 'emerald' : 'rose'}
              />
              <Row
                label="EBITDA margin"
                cells={years.map((y) => pct(y.ebitda_margin))}
                tint="slate"
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* Quarterly detail */}
      <section className="mb-10">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Quarterly detail (12 quarters)</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="text-left px-2 py-2 border-b border-slate-200 font-semibold sticky left-0 bg-slate-50">Period</th>
                <th className="text-right px-2 py-2 border-b border-slate-200 font-semibold">New shops</th>
                <th className="text-right px-2 py-2 border-b border-slate-200 font-semibold">Active shops</th>
                <th className="text-right px-2 py-2 border-b border-slate-200 font-semibold">Active aircraft</th>
                <th className="text-right px-2 py-2 border-b border-slate-200 font-semibold">SaaS ARR</th>
                <th className="text-right px-2 py-2 border-b border-slate-200 font-semibold">Marketplace take</th>
                <th className="text-right px-2 py-2 border-b border-slate-200 font-semibold">Records rev</th>
                <th className="text-right px-2 py-2 border-b border-slate-200 font-semibold">Total Q rev</th>
                <th className="text-right px-2 py-2 border-b border-slate-200 font-semibold">Gross profit</th>
                <th className="text-right px-2 py-2 border-b border-slate-200 font-semibold">EBITDA</th>
              </tr>
            </thead>
            <tbody>
              {quarters.map((q, i) => (
                <tr key={q.label} className={i > 0 ? 'border-t border-slate-100' : ''}>
                  <td className="px-2 py-1.5 font-mono text-slate-700 sticky left-0 bg-white">{q.label}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{q.new_shops}</td>
                  <td className="px-2 py-1.5 text-right text-slate-900 font-medium">{q.active_shops.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{q.active_aircraft.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right text-slate-900 font-semibold">{usd(q.saas_arr)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-600">{usd(q.marketplace_take)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-600">{usd(q.records_revenue)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-900 font-semibold">{usd(q.total_revenue)}</td>
                  <td className="px-2 py-1.5 text-right text-emerald-700 font-medium">{usd(q.gross_profit)}</td>
                  <td className={`px-2 py-1.5 text-right font-medium ${q.ebitda >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{usd(q.ebitda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Assumptions */}
      <section className="mb-10">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Underlying assumptions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AssumptionCard
            title="Shop acquisition"
            rows={[
              ['Year 1 new shops (cumulative)', `${a.new_shops_per_q[0]!.reduce((s, n) => s + n, 0)} (target end-Y1: 50)`],
              ['Year 2 new shops', `${a.new_shops_per_q[1]!.reduce((s, n) => s + n, 0)} (cumulative → 200)`],
              ['Year 3 new shops', `${a.new_shops_per_q[2]!.reduce((s, n) => s + n, 0)} (cumulative → 500)`],
              ['Annual logo churn Y1/Y2/Y3', `${pct(a.annual_churn[0])} / ${pct(a.annual_churn[1])} / ${pct(a.annual_churn[2])}`],
            ]}
          />
          <AssumptionCard
            title="Tier mix & pricing"
            rows={[
              ['Starter ($299/mo · 5 aircraft)', `${pct(a.shop_tier_mix.starter)} of base`],
              ['Pro ($899/mo · 20 aircraft)', `${pct(a.shop_tier_mix.pro)} of base`],
              ['Unlimited ($1,999/mo · 75 aircraft)', `${pct(a.shop_tier_mix.unlimited)} of base`],
              ['Blended monthly per shop', `$${Math.round(a.shop_tier_mix.starter * a.shop_tier_price_mo.starter + a.shop_tier_mix.pro * a.shop_tier_price_mo.pro + a.shop_tier_mix.unlimited * a.shop_tier_price_mo.unlimited).toLocaleString()}`],
            ]}
          />
          <AssumptionCard
            title="Marketplace"
            rows={[
              ['Take rate', pct(a.marketplace_take_rate)],
              ['Y1 GMV (Q4 only — beta)', usd(a.marketplace_gmv_per_q[0]!.reduce((s, n) => s + n, 0))],
              ['Y2 GMV', usd(a.marketplace_gmv_per_q[1]!.reduce((s, n) => s + n, 0))],
              ['Y3 GMV', usd(a.marketplace_gmv_per_q[2]!.reduce((s, n) => s + n, 0))],
              ['Records-access fee', `$${a.records_access_fee} per buyer pull`],
            ]}
          />
          <AssumptionCard
            title="Cost structure"
            rows={[
              ['COGS as % of revenue', pct(a.cogs_pct) + ' (Stripe + AI + infra)'],
              ['Year 1 total opex', usd(a.headcount_per_q[0]!.reduce((s, n) => s + n, 0) + a.gtm_per_q[0]!.reduce((s, n) => s + n, 0) + a.other_opex_per_q[0]!.reduce((s, n) => s + n, 0))],
              ['Year 2 total opex', usd(a.headcount_per_q[1]!.reduce((s, n) => s + n, 0) + a.gtm_per_q[1]!.reduce((s, n) => s + n, 0) + a.other_opex_per_q[1]!.reduce((s, n) => s + n, 0))],
              ['Year 3 total opex', usd(a.headcount_per_q[2]!.reduce((s, n) => s + n, 0) + a.gtm_per_q[2]!.reduce((s, n) => s + n, 0) + a.other_opex_per_q[2]!.reduce((s, n) => s + n, 0))],
            ]}
          />
        </div>
      </section>

      {/* Scenarios — bear / base / bull */}
      <section className="mb-10">
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          Sensitivity — bear / base / bull
        </h2>
        <p className="text-sm text-slate-600 max-w-3xl mb-4">
          Three variants of the same model. Bear cuts shop acquisition to 60%
          of base + adds 5pp annual churn + halves marketplace ramp. Bull does
          the opposite (+30% acquisition, −3pp churn, 1.5× marketplace). Same
          cost structure on all three — the upside is from acceleration, not
          from squeezing opex.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-[0.1em] text-[11px]">
              <tr>
                <th className="text-left px-3 py-2.5 border-b border-slate-200 font-semibold">Year</th>
                <th className="text-right px-3 py-2.5 border-b border-slate-200 font-semibold">
                  Bear · ending ARR
                </th>
                <th className="text-right px-3 py-2.5 border-b border-slate-200 font-semibold">
                  Base · ending ARR
                </th>
                <th className="text-right px-3 py-2.5 border-b border-slate-200 font-semibold">
                  Bull · ending ARR
                </th>
                <th className="text-right px-3 py-2.5 border-b border-slate-200 font-semibold">
                  Bear · EBITDA
                </th>
                <th className="text-right px-3 py-2.5 border-b border-slate-200 font-semibold">
                  Base · EBITDA
                </th>
                <th className="text-right px-3 py-2.5 border-b border-slate-200 font-semibold">
                  Bull · EBITDA
                </th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((y) => {
                const bear = computeScenario('bear').years.find((yy) => yy.year === y)!
                const base = computeScenario('base').years.find((yy) => yy.year === y)!
                const bull = computeScenario('bull').years.find((yy) => yy.year === y)!
                return (
                  <tr key={y} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-900">Year {y}</td>
                    <td className="px-3 py-2 text-right text-rose-700">{usd(bear.ending_arr)}</td>
                    <td className="px-3 py-2 text-right text-violet-700 font-semibold">
                      {usd(base.ending_arr)}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-700">{usd(bull.ending_arr)}</td>
                    <td className={`px-3 py-2 text-right ${bear.ebitda >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{usd(bear.ebitda)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${base.ebitda >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{usd(base.ebitda)}</td>
                    <td className={`px-3 py-2 text-right ${bull.ebitda >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{usd(bull.ebitda)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          All three scenarios use the same headcount + GTM + other-opex inputs. Bear shows the burn we accept
          while we figure out distribution; bull shows the upside if the owner-portal flywheel kicks in early.
        </p>
      </section>

      {/* Honest commentary */}
      <section className="mb-10">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Where this model is sensitive</h2>
        <ul className="space-y-2 text-sm text-slate-700">
          <li>
            <strong>Shop acquisition rate.</strong> The single largest driver. Year-1 target is 50 shops; we get there from
            AOPA Summit + EAA AirVenture + the founding-tenant referral motion. If we hit 30 instead of 50, Y3 ARR lands
            closer to $15M than $22M.
          </li>
          <li>
            <strong>Churn.</strong> Modeled at 15% / 10% / 7% — conservative for vertical SaaS with FAA-mandated record
            retention as a switching cost. If churn comes in flat at 15% across all 3 years, Y3 ARR is ~$18M.
          </li>
          <li>
            <strong>Marketplace ramp.</strong> Year 2 starts to add real revenue. The model assumes 2.5% take on $8M Y2
            GMV — that requires ~80 facilitated sales at $100K avg, which our existing tenant base would already approach.
          </li>
          <li>
            <strong>AI cost / scaling.</strong> Modeled at 6% of revenue inside the 18% COGS line. If Anthropic / OpenAI
            pricing changes materially, we have the option to swap providers (interface is provider-agnostic).
          </li>
        </ul>
      </section>

      <footer className="pt-6 border-t border-slate-200 text-[11px] text-slate-500">
        Confidential. Numbers are author-prepared and revised 2026-05-22. Adjust the
        assumptions block in lib/investor/financial-model.ts and re-render this page
        to run a sensitivity pass.
      </footer>
    </div>
  )
}

function Row({
  label,
  cells,
  bold,
  dim,
  tint,
}: {
  label: string
  cells: string[]
  bold?: boolean
  dim?: boolean
  tint?: 'emerald' | 'rose' | 'slate' | ((y: { year: number }) => 'emerald' | 'rose' | 'slate')
}) {
  return (
    <tr className="border-t border-slate-100">
      <td className={`px-3 py-2 ${bold ? 'font-semibold text-slate-900' : dim ? 'text-slate-500' : 'text-slate-700'}`}>
        {label}
      </td>
      {cells.map((c, i) => {
        const resolvedTint = typeof tint === 'function' ? tint({ year: i + 1 }) : tint
        const tintCls =
          resolvedTint === 'emerald'
            ? 'text-emerald-700 font-semibold'
            : resolvedTint === 'rose'
              ? 'text-rose-700 font-semibold'
              : resolvedTint === 'slate'
                ? 'text-slate-600'
                : ''
        return (
          <td
            key={i}
            className={`px-3 py-2 text-right ${tintCls} ${bold ? 'font-semibold' : ''}`}
          >
            {c}
          </td>
        )
      })}
    </tr>
  )
}

function AssumptionCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-3">
        {title}
      </h3>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-slate-600">{k}</dt>
            <dd className="text-slate-900 font-medium text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
