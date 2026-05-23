/**
 * Sub-processor inventory — DPA-ready vendor list.
 *
 * Required by GDPR, expected by every enterprise customer's security
 * questionnaire, and a SOC2 CC9.2 (Vendor Management) artefact. Lists
 * every third party that touches customer data, the legal basis, the
 * data category, and the vendor's own attestation.
 */
import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { PrintButton } from '@/components/investor/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sub-processors' }

interface SubProcessor {
  vendor: string
  purpose: string
  data_category: string
  storage_region: string
  attestation: string
  attestationLink?: string
  type: 'infra' | 'ai' | 'analytics' | 'comms' | 'payments' | 'monitoring'
}

const PROCESSORS: SubProcessor[] = [
  {
    vendor: 'Supabase Inc.',
    purpose: 'Authentication, Postgres database, object storage',
    data_category: 'All customer data — user records, aircraft, documents, audit log',
    storage_region: 'us-east-2 (Ohio)',
    attestation: 'SOC2 Type II',
    attestationLink: 'https://supabase.com/security',
    type: 'infra',
  },
  {
    vendor: 'Vercel Inc.',
    purpose: 'Application hosting, Edge CDN, routing middleware, Fluid Compute',
    data_category: 'Request/response payloads in-flight only (no storage)',
    storage_region: 'iad1 (Washington, D.C.)',
    attestation: 'SOC2 Type II + ISO 27001',
    attestationLink: 'https://vercel.com/legal/privacy-policy',
    type: 'infra',
  },
  {
    vendor: 'Stripe Inc.',
    purpose: 'Payment processing, subscription billing, payouts',
    data_category: 'Payment method tokens (card numbers never touch our servers)',
    storage_region: 'Global (PCI Level 1)',
    attestation: 'SOC2 Type II + PCI DSS Level 1',
    attestationLink: 'https://stripe.com/legal/ssa',
    type: 'payments',
  },
  {
    vendor: 'OpenAI L.L.C.',
    purpose: 'GPT-4o answer generation, text-embedding-3-small embeddings',
    data_category: 'Question text + retrieved chunk excerpts (zero-retention API)',
    storage_region: 'US',
    attestation: 'SOC2 Type II — zero-data-retention attestation in force',
    attestationLink: 'https://openai.com/policies/data-usage-policies',
    type: 'ai',
  },
  {
    vendor: 'Cohere Inc.',
    purpose: 'Cross-encoder reranking (rerank-v3.5)',
    data_category: 'Query + candidate chunk text (re-scored, not retained)',
    storage_region: 'US',
    attestation: 'SOC2 Type II',
    attestationLink: 'https://cohere.com/security',
    type: 'ai',
  },
  {
    vendor: 'Google LLC (Document AI)',
    purpose: 'OCR of uploaded PDFs / scanned logbook images',
    data_category: 'Document page images, returned structured text + bounding boxes',
    storage_region: 'us (multi-region)',
    attestation: 'SOC2 Type II + ISO 27001/27017/27018',
    attestationLink: 'https://cloud.google.com/security/compliance/soc-2',
    type: 'ai',
  },
  {
    vendor: 'Sentry (Functional Software Inc.)',
    purpose: 'Application error tracking + stack traces',
    data_category: 'Error events, scrubbed of PII via beforeSend filter',
    storage_region: 'us',
    attestation: 'SOC2 Type II',
    attestationLink: 'https://sentry.io/security/',
    type: 'monitoring',
  },
  {
    vendor: 'PostHog Inc.',
    purpose: 'Product analytics, feature-flag delivery',
    data_category: 'Anonymous event telemetry; opt-in for PII enrichment',
    storage_region: 'us-east-1',
    attestation: 'SOC2 Type II',
    attestationLink: 'https://posthog.com/security',
    type: 'analytics',
  },
  {
    vendor: 'Resend (Resend Inc.)',
    purpose: 'Transactional email — invite, approval, invoice',
    data_category: 'Email addresses + email body content',
    storage_region: 'us-east-1',
    attestation: 'SOC2 Type II',
    attestationLink: 'https://resend.com/legal/security',
    type: 'comms',
  },
  {
    vendor: 'Twilio Inc.',
    purpose: 'SMS — owner-portal opt-in notifications (low-volume)',
    data_category: 'Phone numbers + SMS body content',
    storage_region: 'us',
    attestation: 'SOC2 Type II + ISO 27001',
    attestationLink: 'https://www.twilio.com/legal/data-protection',
    type: 'comms',
  },
  {
    vendor: 'GitHub Inc. (Microsoft)',
    purpose: 'Source-code repository + CI',
    data_category: 'Code only (no customer data)',
    storage_region: 'us',
    attestation: 'SOC2 Type II + ISO 27001',
    attestationLink: 'https://github.com/security',
    type: 'infra',
  },
  {
    vendor: 'Anthropic PBC',
    purpose: 'Optional fallback LLM (provider-agnostic interface; not in default path)',
    data_category: 'Question text + retrieved chunk excerpts (zero-retention)',
    storage_region: 'us',
    attestation: 'SOC2 Type II',
    attestationLink: 'https://www.anthropic.com/trust',
    type: 'ai',
  },
]

const TYPE_TINT: Record<SubProcessor['type'], string> = {
  infra: 'bg-sky-50 text-sky-700 border-sky-200',
  ai: 'bg-violet-50 text-violet-700 border-violet-200',
  analytics: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  comms: 'bg-amber-50 text-amber-700 border-amber-200',
  payments: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  monitoring: 'bg-rose-50 text-rose-700 border-rose-200',
}

export default function SubProcessorsPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
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
          <ShieldCheck className="w-4 h-4" />
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">
            Sub-processor inventory · DPA-ready
          </span>
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
          Every vendor that touches customer data.
        </h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          Required by GDPR Article 28, expected by every enterprise security
          questionnaire, and the SOC2 CC9.2 (Vendor Management) artefact.
          Every vendor below is SOC2 Type II attested; for AI providers we use
          the zero-data-retention configuration where available.
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 uppercase tracking-[0.1em] text-[11px]">
            <tr>
              <th className="text-left px-3 py-3 border-b border-slate-200 font-semibold">Vendor</th>
              <th className="text-left px-3 py-3 border-b border-slate-200 font-semibold">Type</th>
              <th className="text-left px-3 py-3 border-b border-slate-200 font-semibold">Purpose</th>
              <th className="text-left px-3 py-3 border-b border-slate-200 font-semibold">Data category</th>
              <th className="text-left px-3 py-3 border-b border-slate-200 font-semibold">Region</th>
              <th className="text-left px-3 py-3 border-b border-slate-200 font-semibold">Attestation</th>
            </tr>
          </thead>
          <tbody>
            {PROCESSORS.map((p, i) => (
              <tr
                key={p.vendor}
                className={i > 0 ? 'border-t border-slate-100' : ''}
              >
                <td className="px-3 py-3 align-top font-medium text-slate-900">{p.vendor}</td>
                <td className="px-3 py-3 align-top">
                  <span
                    className={`text-[10px] uppercase tracking-wider font-semibold rounded border px-1.5 py-0.5 ${TYPE_TINT[p.type]}`}
                  >
                    {p.type}
                  </span>
                </td>
                <td className="px-3 py-3 align-top text-slate-700">{p.purpose}</td>
                <td className="px-3 py-3 align-top text-slate-600 text-xs">{p.data_category}</td>
                <td className="px-3 py-3 align-top text-slate-600 text-xs font-mono">{p.storage_region}</td>
                <td className="px-3 py-3 align-top">
                  {p.attestationLink ? (
                    <a
                      href={p.attestationLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-700 hover:text-violet-900 underline-offset-4 hover:underline"
                    >
                      {p.attestation} →
                    </a>
                  ) : (
                    <span className="text-slate-600">{p.attestation}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50/40 p-5">
        <h2 className="text-sm font-semibold text-emerald-800 mb-2 uppercase tracking-wide">
          Customer-facing DPA
        </h2>
        <p className="text-sm text-slate-700">
          Our standard Data Processing Agreement (template based on the EU SCC
          + UK IDTA) is signed with every enterprise customer. The DPA
          references this sub-processor list. We commit to 30 days advance
          notice for any new sub-processor; existing customers can object
          within that window. Request the executed DPA via{' '}
          <a href="mailto:trust@myaircraft.us" className="text-emerald-700 underline">
            trust@myaircraft.us
          </a>
          .
        </p>
      </section>

      <footer className="mt-10 pt-6 border-t border-slate-200 text-[11px] text-slate-500">
        Last reviewed: 2026-05-22. Sub-processor changes are announced via
        the customer trust mailing list 30 days in advance.
      </footer>
    </div>
  )
}
