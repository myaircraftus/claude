/**
 * Investor Readiness — the pre-flight checklist a founder runs through
 * before sending a deck. Honest status (Ready / In progress / Gap)
 * across pitch, financials, legal, security, team, product. If a row
 * is "Gap" we surface it instead of hiding it.
 */
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Clock3, AlertTriangle } from 'lucide-react'
import { PrintButton } from '@/components/investor/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Investor readiness' }

interface Row {
  status: 'ready' | 'in_progress' | 'gap'
  category: string
  item: string
  note?: string
  link?: string
}

const ROWS: Row[] = [
  // Pitch artefacts
  { status: 'ready', category: 'Pitch', item: '15-slide deck w/ Present mode', link: '/investor-room/pitch' },
  { status: 'ready', category: 'Pitch', item: 'Executive summary / business plan', link: '/investor-room/business-plan' },
  { status: 'ready', category: 'Pitch', item: 'FAQ covering hard questions', link: '/investor-room/faq' },
  { status: 'ready', category: 'Pitch', item: 'Architecture diagram in deck (slide 11)', link: '/investor-room/pitch#slide-architecture' },
  { status: 'ready', category: 'Pitch', item: 'Market funnel diagram (slide 4)' },
  { status: 'ready', category: 'Pitch', item: 'GTM funnel diagram (slide 8)' },
  { status: 'ready', category: 'Pitch', item: 'Competitor matrix slide (slide 10)', link: '/investor-room/pitch#slide-competition' },
  { status: 'ready', category: 'Pitch', item: 'One-page investor summary', link: '/investor-room/one-pager' },
  { status: 'in_progress', category: 'Pitch', item: 'Live demo recording (60 sec)', note: 'Record via Loom or similar — 20 min task' },

  // Financials
  { status: 'ready', category: 'Financials', item: '3-year bottoms-up model on screen', link: '/investor-room/financial-model' },
  { status: 'ready', category: 'Financials', item: 'CSV download of full model', link: '/api/investor/model.csv' },
  { status: 'ready', category: 'Financials', item: 'Cap table (pre/post round)', link: '/investor-room/cap-table' },
  { status: 'ready', category: 'Financials', item: 'Use-of-funds breakdown', link: '/investor-room/use-of-funds' },
  { status: 'in_progress', category: 'Financials', item: 'Trailing-12-month P&L', note: 'Pre-revenue today; share when first invoice posts' },
  { status: 'gap', category: 'Financials', item: '409A valuation', note: 'Not needed until first option grant to a non-founder' },
  { status: 'ready', category: 'Financials', item: 'Sensitivity model (bear / base / bull)', link: '/investor-room/financial-model' },

  // Product evidence
  { status: 'ready', category: 'Product', item: 'Live production tenant (Horizon Flights)', link: '/dashboard' },
  { status: 'ready', category: 'Product', item: '20 written SOPs in /sop-library', link: '/sop-library' },
  { status: 'ready', category: 'Product', item: 'AI Simulator with 16 scenarios', link: '/sop-library/simulator' },
  { status: 'ready', category: 'Product', item: 'Live metrics dashboard', link: '/investor-room/metrics' },
  { status: 'ready', category: 'Product', item: 'Owner portal end-to-end', link: '/owner/dashboard' },
  { status: 'ready', category: 'Product', item: '247K+ embeddings indexed on prod' },
  { status: 'in_progress', category: 'Product', item: '2nd & 3rd paying tenant', note: 'Pipeline being built; expected to close before seed' },

  // Security / compliance
  { status: 'ready', category: 'Security', item: 'Public security page', link: '/security' },
  { status: 'ready', category: 'Security', item: 'SOC2 control matrix (27 controls)', link: '/sop-library/compliance' },
  { status: 'ready', category: 'Security', item: 'Master compliance manual', link: '/sop-library/19-compliance-manual' },
  { status: 'ready', category: 'Security', item: 'Incident-response runbook' },
  { status: 'ready', category: 'Security', item: 'Disaster-recovery runbook (RTO 4h / RPO 5min)' },
  { status: 'ready', category: 'Security', item: 'RLS multi-tenancy at DB layer' },
  { status: 'in_progress', category: 'Security', item: 'SOC2 Type II audit', note: 'Auditor engagement scheduled at seed close. Currently using Drata-grade controls.' },
  { status: 'in_progress', category: 'Security', item: 'External penetration test', note: 'Cobalt or RamSec — engagement at seed close' },

  // Legal
  { status: 'ready', category: 'Legal', item: 'Terms of Service / Privacy Policy', link: '/terms' },
  { status: 'ready', category: 'Legal', item: 'GDPR Article 20 data-export endpoint', link: '/api/owner/export' },
  { status: 'ready', category: 'Legal', item: 'CCPA-grade data-deletion flow' },
  { status: 'in_progress', category: 'Legal', item: 'NVCA-style term sheet template', note: 'Counsel engaging on draft' },
  { status: 'gap', category: 'Legal', item: 'Independent board seat candidate', note: 'Sourced at lead-investor close' },
  { status: 'in_progress', category: 'Legal', item: 'Founder IP assignment + 83(b) elections', note: 'Filed; copies on request under NDA' },

  // Team
  { status: 'ready', category: 'Team', item: 'Founder bio + reachable email', link: '/investor-room/team' },
  { status: 'ready', category: 'Team', item: 'Open hires roster with comp + equity', link: '/investor-room/team' },
  { status: 'ready', category: 'Team', item: 'Advisor roster (open seats)', link: '/investor-room/team' },
  { status: 'in_progress', category: 'Team', item: 'A&P mechanic advisor signed', note: 'Two candidates in conversation' },
  { status: 'in_progress', category: 'Team', item: 'Type-club advisor signed (Cirrus/COPA/ABS)', note: 'Outreach in progress' },

  // Data room
  { status: 'ready', category: 'Data Room', item: 'SOC2 + security packet (matrix + runbooks)' },
  { status: 'ready', category: 'Data Room', item: 'Product evidence (live SOPs + simulator)' },
  { status: 'ready', category: 'Data Room', item: 'Customer reference — Horizon Flights case study', link: '/investor-room/customers/horizon-flights' },
  { status: 'in_progress', category: 'Data Room', item: 'Customer reference — second paying tenant', note: 'Pipeline being built; expected before seed close' },
  { status: 'ready', category: 'Data Room', item: 'Sub-processor inventory (DPA-ready)', link: '/investor-room/sub-processors' },
  { status: 'gap', category: 'Data Room', item: 'Insurance certificates (E&O + cyber)', note: 'Quotes pending — bind at seed close' },
]

function pillFor(s: Row['status']): { tint: string; label: string; icon: typeof CheckCircle2 } {
  if (s === 'ready') return { tint: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Ready', icon: CheckCircle2 }
  if (s === 'in_progress') return { tint: 'bg-amber-50 text-amber-700 border-amber-200', label: 'In progress', icon: Clock3 }
  return { tint: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Gap', icon: AlertTriangle }
}

export default function ReadinessPage() {
  const byCategory = new Map<string, Row[]>()
  for (const r of ROWS) {
    const list = byCategory.get(r.category) ?? []
    list.push(r)
    byCategory.set(r.category, list)
  }
  const ready = ROWS.filter((r) => r.status === 'ready').length
  const inprog = ROWS.filter((r) => r.status === 'in_progress').length
  const gap = ROWS.filter((r) => r.status === 'gap').length

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
        <div className="text-[10px] uppercase tracking-[0.2em] text-violet-700 font-semibold mb-2">
          Pre-flight checklist
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
          Investor readiness — what's actually ready.
        </h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          Honest status across every artefact an investor or lawyer will ask for.
          If something says <span className="font-semibold text-rose-700">Gap</span>,
          it's surfaced here instead of buried in a "we'll get back to you."
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> {ready} ready
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 font-medium">
            <Clock3 className="w-3.5 h-3.5" /> {inprog} in progress
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" /> {gap} known gaps
          </span>
          <span className="text-xs text-slate-500">
            {Math.round((ready / ROWS.length) * 100)}% of {ROWS.length} items
          </span>
        </div>
      </header>

      <div className="space-y-8">
        {Array.from(byCategory.entries()).map(([cat, items]) => (
          <section key={cat}>
            <h2 className="text-base font-semibold text-slate-900 mb-3">{cat}</h2>
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              {items.map((row, i) => {
                const p = pillFor(row.status)
                const Icon = p.icon
                return (
                  <div
                    key={`${cat}-${row.item}`}
                    className={`flex items-start gap-4 px-4 py-3 ${i > 0 ? 'border-t border-slate-100' : ''}`}
                  >
                    <Icon
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        row.status === 'ready'
                          ? 'text-emerald-600'
                          : row.status === 'in_progress'
                            ? 'text-amber-600'
                            : 'text-rose-600'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-slate-900 font-medium">
                          {row.link ? (
                            <Link href={row.link} className="hover:text-violet-700 underline-offset-4 hover:underline">
                              {row.item}
                            </Link>
                          ) : (
                            row.item
                          )}
                        </div>
                        <span
                          className={`shrink-0 inline-block text-[10px] uppercase tracking-wider font-semibold rounded border px-1.5 py-0.5 ${p.tint}`}
                        >
                          {p.label}
                        </span>
                      </div>
                      {row.note && (
                        <div className="text-xs text-slate-600 mt-1">{row.note}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-10 pt-6 border-t border-slate-200 text-[11px] text-slate-500">
        Confidential. Updated 2026-05-22. Re-run before sending the deck to a new investor.
      </footer>
    </div>
  )
}
