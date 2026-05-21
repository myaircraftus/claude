/**
 * Data room — diligence packet index. Each row is a category of
 * documents an investor wants to see: financials, legal, security,
 * customer refs, product evidence. Where the document is on the
 * platform (SOP, runbook, public site), the row deep-links to it.
 * Where it's not yet uploaded, the row shows a "Coming on request"
 * pill so the investor knows what's available.
 */
import Link from 'next/link'
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  ShieldCheck,
  DollarSign,
  Scale,
  Users,
  Database,
} from 'lucide-react'
import { PrintButton } from '@/components/investor/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Data room | Investor Room' }

interface Row {
  label: string
  description: string
  status: 'live' | 'on-request' | 'in-progress'
  href?: string
  external?: boolean
}

const SECTIONS: Array<{ title: string; icon: typeof FileText; rows: Row[] }> = [
  {
    title: 'Product evidence',
    icon: Database,
    rows: [
      {
        label: 'SOP Library (15 SOPs)',
        description:
          'Source-of-truth manual covering every workflow. Live, versioned, in-product.',
        status: 'live',
        href: '/sop-library',
      },
      {
        label: 'Full-stack architecture (SOP-13)',
        description:
          'Multi-tenancy, RAG engine, ingestion pipeline, deployment, observability. ~60 pages.',
        status: 'live',
        href: '/sop-library/13-fullstack-architecture-rag-admin',
      },
      {
        label: 'AI Simulator (16 scenarios)',
        description:
          'Live scenario-based training environment grounded in the SOP corpus.',
        status: 'live',
        href: '/sop-library/simulator',
      },
      {
        label: 'Customer reference — Horizon Flights',
        description:
          'Founding tenant. 67 production documents, 25K embeddings indexed, owner portal active.',
        status: 'on-request',
      },
    ],
  },
  {
    title: 'Security & compliance',
    icon: ShieldCheck,
    rows: [
      {
        label: 'SOC2 control matrix (27 criteria)',
        description:
          'Auditor-facing matrix mapping every Trust Service Criterion to a control + SOP evidence.',
        status: 'live',
        href: '/sop-library/compliance',
      },
      {
        label: 'Incident-response runbook',
        description:
          'P0–P3 severity classification, security incident playbook, post-mortem template.',
        status: 'live',
        href: 'https://github.com/myaircraftus/claude/blob/main/docs/incident-response-runbook.md',
        external: true,
      },
      {
        label: 'Disaster-recovery runbook',
        description:
          'RTO 4h · RPO 5min · Supabase PITR · Vercel rollback · per-scenario decision trees.',
        status: 'live',
        href: 'https://github.com/myaircraftus/claude/blob/main/docs/disaster-recovery-runbook.md',
        external: true,
      },
      {
        label: 'Penetration test report',
        description:
          'External pen-test engagement. Scheduled Q3 — report available post-engagement.',
        status: 'in-progress',
      },
      {
        label: 'SOC2 Type II audit report',
        description: 'Audit firm engagement scheduled for use-of-funds milestone.',
        status: 'in-progress',
      },
      {
        label: 'Data Processing Agreement (template)',
        description:
          'Standard DPA we sign with every shop. Includes sub-processor list.',
        status: 'on-request',
      },
    ],
  },
  {
    title: 'Financials',
    icon: DollarSign,
    rows: [
      {
        label: 'Cap table',
        description:
          'Pre- and post-money cap table with the proposed seed round, dilution waterfalls.',
        status: 'on-request',
      },
      {
        label: '3-year financial model (.xlsx)',
        description:
          'Bottoms-up unit-economics model. Per-aircraft ARR, churn, CAC payback, sensitivity tabs.',
        status: 'on-request',
      },
      {
        label: 'Trailing-12-month P&L',
        description:
          'Bootstrapped financials YTD. Available under NDA once a term sheet is in motion.',
        status: 'on-request',
      },
      {
        label: 'Stripe revenue dashboard',
        description: 'Read-only Stripe export of marketplace + subscription revenue.',
        status: 'on-request',
      },
      {
        label: 'Bank statements (sanitized)',
        description: 'Last 6 months of operating account activity, sanitized.',
        status: 'on-request',
      },
    ],
  },
  {
    title: 'Legal',
    icon: Scale,
    rows: [
      {
        label: 'Certificate of incorporation',
        description: 'Delaware C-Corp, dated 2025.',
        status: 'on-request',
      },
      {
        label: '83(b) elections + founder equity grants',
        description: 'Filed and on record.',
        status: 'on-request',
      },
      {
        label: 'Customer Master Service Agreement (template)',
        description: 'Standard MSA we sign with every shop tenant.',
        status: 'on-request',
      },
      {
        label: 'Terms of Service / Privacy Policy',
        description: 'Live on the public site and the in-app footer.',
        status: 'live',
        href: '/terms',
      },
      {
        label: 'IP assignment + employment agreements',
        description: 'Standard IP-assignment + at-will employment templates used for all hires.',
        status: 'on-request',
      },
    ],
  },
  {
    title: 'Team & people',
    icon: Users,
    rows: [
      {
        label: 'Founder bio + LinkedIn',
        description: 'Andy Patel — pilot, A330 engineering background, full-stack operator.',
        status: 'live',
        href: '/investor-room/team',
      },
      {
        label: 'Hiring plan (next 12 months)',
        description:
          'Open seats with comp ranges and start-date targets. Aligned with the use-of-funds breakdown.',
        status: 'on-request',
      },
      {
        label: 'Advisor list + advisor agreements',
        description: 'Current advisors and the agreements that bind them.',
        status: 'on-request',
      },
    ],
  },
]

const STATUS_STYLES: Record<Row['status'], { tint: string; label: string }> = {
  live: { tint: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Live' },
  'in-progress': { tint: 'bg-amber-50 text-amber-700 border-amber-200', label: 'In progress' },
  'on-request': { tint: 'bg-slate-100 text-slate-600 border-slate-200', label: 'On request' },
}

export default function DataRoomPage() {
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
        <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-semibold mb-2">
          Data room · diligence packet
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
          Everything an investor would ask for.
        </h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          Rows marked <span className="font-semibold text-emerald-700">Live</span> are
          available right now via deep-link.{' '}
          <span className="font-semibold text-amber-700">In progress</span> means scheduled
          but not yet delivered. <span className="font-semibold text-slate-600">On request</span>{' '}
          means email andy@horf.us and we&apos;ll share under NDA — typically same-day.
        </p>
      </header>

      <div className="space-y-8">
        {SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <section key={section.title}>
              <div className="flex items-center gap-2 mb-3">
                <Icon className="w-4 h-4 text-slate-600" />
                <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase tracking-[0.1em]">
                    <tr>
                      <th className="text-left px-3 py-2 border-b border-slate-200 font-semibold">
                        Document
                      </th>
                      <th className="text-left px-3 py-2 border-b border-slate-200 font-semibold">
                        Description
                      </th>
                      <th className="text-left px-3 py-2 border-b border-slate-200 font-semibold">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, i) => (
                      <tr
                        key={row.label}
                        className={i > 0 ? 'border-t border-slate-100' : ''}
                      >
                        <td className="px-3 py-2.5 align-top">
                          {row.href ? (
                            <Link
                              href={row.href}
                              target={row.external ? '_blank' : undefined}
                              rel={row.external ? 'noopener noreferrer' : undefined}
                              className="inline-flex items-center gap-1 text-violet-700 hover:text-violet-900 font-medium"
                            >
                              {row.label}
                              {row.external && (
                                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                              )}
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-800">{row.label}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 align-top">
                          {row.description}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <span
                            className={`inline-block text-[10px] uppercase tracking-wider font-semibold rounded border px-1.5 py-0.5 ${STATUS_STYLES[row.status].tint}`}
                          >
                            {STATUS_STYLES[row.status].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}
      </div>

      <footer className="mt-10 pt-6 border-t border-slate-200 text-[11px] text-slate-500">
        Some items above are intentionally not auto-published. Email{' '}
        <a href="mailto:andy@horf.us" className="text-violet-700">
          andy@horf.us
        </a>{' '}
        with the document name(s) and we&apos;ll share under NDA.
      </footer>
    </div>
  )
}
