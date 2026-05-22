/**
 * Team page — founder, builders, advisors, open seats. Keeping the
 * scope small and honest while we're a one-founder shop building
 * toward the seed; the team page grows alongside the cap table.
 */
import Link from 'next/link'
import { ArrowLeft, Mail, ExternalLink, Sparkles, Users } from 'lucide-react'
import { PrintButton } from '@/components/investor/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Team | Investor Room' }

export default function TeamPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
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
        <div className="text-[10px] uppercase tracking-[0.18em] text-fuchsia-700 font-semibold mb-2">
          Team
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
          Who&apos;s building it.
        </h1>
        <p className="text-sm text-slate-600 max-w-2xl">
          A one-founder shop today, hiring against the use-of-funds plan in the pitch
          deck. The advisor roster is intentionally short and load-bearing; we plan
          to grow it before close of seed.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold mb-4">
          Founder
        </h2>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-start gap-5">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-100 to-amber-100 flex items-center justify-center text-2xl font-semibold text-violet-700 shrink-0">
              AP
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-slate-900">Andy Patel</h3>
              <p className="text-sm text-slate-600 mb-3">Founder & CEO · myaircraft.us</p>
              <ul className="text-sm text-slate-700 space-y-1.5">
                <li>• Pilot. Airbus A330 engineering background.</li>
                <li>
                  • Ten years building product across hardware-adjacent SaaS and
                  regulated-industry tooling.
                </li>
                <li>
                  • Full-stack: writes the Next.js, the Postgres migrations, the
                  retrieval engine, and the OAuth glue — code ships daily on Vercel
                  production.
                </li>
                <li>
                  • Reachable at{' '}
                  <a
                    href="mailto:andy@horf.us"
                    className="text-violet-700 hover:text-violet-900 inline-flex items-center gap-1"
                  >
                    andy@horf.us <Mail className="w-3 h-3" />
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold mb-4">
          Operating model
        </h2>
        <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-violet-700" />
            <h3 className="text-sm font-semibold text-violet-900">
              AI-in-the-loop engineering
            </h3>
          </div>
          <p className="text-sm text-slate-700">
            The product is built with Claude Code / GPT-4o in a fully-instrumented
            review loop. Every change ships against a 15-SOP standard, a 27-criteria
            SOC2 matrix, and a code-review-graph that catches cross-file impact before
            merge. The leverage is real: we&apos;ve shipped what a 3-engineer team
            usually builds in 12 months at a fraction of the burn — and we documented
            every workflow as we went, which is what the SOP Library shows.
          </p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold mb-4">
          Open seats (close of seed)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <OpenSeat
            title="Senior staff engineer · multi-tenant systems"
            sub="Owns the Supabase + Postgres layer. RLS, pgvector, indexing, scale."
            comp="$200K – $250K + 0.5–1.0%"
          />
          <OpenSeat
            title="Founding mechanic-in-residence (A&P)"
            sub="Embedded in the build. Keeps the regulatory model honest end-to-end."
            comp="$120K – $160K + 0.25–0.50%"
          />
          <OpenSeat
            title="GTM lead · GA shop network"
            sub="Owns the founding 25-shop cohort. Conferences, type-club partners, sales."
            comp="$160K base + variable + 0.50–1.0%"
          />
          <OpenSeat
            title="Product designer (contract → FT)"
            sub="Shop UI · owner portal · brand polish. Starts contract, converts at seed close."
            comp="$140K – $180K (FT) + 0.25%"
          />
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold mb-4">
          Advisor seats (open)
        </h2>
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex items-start gap-2">
            <Users className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <span>
              <strong className="text-slate-900">FAA Designated Engineering Representative.</strong>{' '}
              Keeps the recordkeeping model defensible.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Users className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <span>
              <strong className="text-slate-900">Type-club leadership.</strong> One advisor
              from Cirrus Owners, COPA, or ABS — the channel partnership matters for
              year-2 distribution.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Users className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <span>
              <strong className="text-slate-900">Vertical SaaS operator.</strong> Founder
              or early operator from ServiceTitan, Procore, Toast, or similar — has
              seen the regulated-SMB GTM motion at scale.
            </span>
          </li>
        </ul>
        <p className="mt-5 text-sm text-slate-600">
          Interested in an advisor seat? Email{' '}
          <a
            href="mailto:andy@horf.us"
            className="text-violet-700 hover:text-violet-900 inline-flex items-center gap-1"
          >
            andy@horf.us <ExternalLink className="w-3 h-3" />
          </a>
          .
        </p>
      </section>
    </div>
  )
}

function OpenSeat({ title, sub, comp }: { title: string; sub: string; comp: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-900 leading-snug">{title}</div>
      <div className="text-xs text-slate-600 mt-1.5 leading-relaxed">{sub}</div>
      <div className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded px-2 py-0.5">
        {comp}
      </div>
    </div>
  )
}
