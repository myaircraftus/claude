import Link from 'next/link'
import { ArrowLeft, ShieldCheck, ExternalLink } from 'lucide-react'
import { listSops } from '@/lib/sop/parser'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'SOC2 Compliance Matrix | SOP Library',
}

/**
 * SOC2 Compliance Aggregator
 *
 * One-page view of every SOC2 Trust Service Criterion that's mapped
 * to a control in the SOP corpus. Static data because the mappings
 * are authored, not derived — each control links back to the SOP
 * section that documents the evidence.
 *
 * This page is the auditor-facing deliverable referenced by SOP-13 §15.
 * An auditor visiting `/sop-library/compliance` gets the entire control
 * universe in one printable matrix.
 */

interface ControlRow {
  criterion: string
  description: string
  control: string
  evidence: string
  sopSlug: string
  sopSection?: string
  status: 'implemented' | 'partial' | 'gap'
}

const CONTROLS: Record<string, ControlRow[]> = {
  'Security (CC — Common Criteria)': [
    { criterion: 'CC6.1', description: 'Logical access controls', control: 'Role-based access at every route + RLS at DB layer', evidence: 'SOP-13 §4-5', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '4-multi-tenancy-architecture', status: 'implemented' },
    { criterion: 'CC6.2', description: 'Access provisioning', control: 'Invite-only staff onboarding via /admin/users', evidence: 'SOP-10 §4', sopSlug: '10-mechanic-workforce', sopSection: '4-onboarding-a-mechanic', status: 'implemented' },
    { criterion: 'CC6.3', description: 'Access removal', control: 'Role deactivation + immediate session revocation', evidence: 'SOP-12 §12', sopSlug: '12-owner-portal-experience', sopSection: '12-owner-portal-security', status: 'implemented' },
    { criterion: 'CC6.6', description: 'Identity authentication', control: 'Supabase Auth (JWT, 1h expiry, refresh rotation)', evidence: 'SOP-13 §5', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '5-authentication-and-authorization', status: 'implemented' },
    { criterion: 'CC6.7', description: 'Restricted data transmission', control: 'TLS 1.2+ everywhere; HTTP redirected', evidence: 'SOP-13 §13.2', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '13-data-security-and-encryption-soc2-grade', status: 'implemented' },
    { criterion: 'CC6.8', description: 'System hardening', control: 'Server-only secrets; no service-role key in client bundle', evidence: 'SOP-13 §13.3', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '13-data-security-and-encryption-soc2-grade', status: 'implemented' },
    { criterion: 'CC7.1', description: 'Change management', control: 'PR review on every change; branch protection on main', evidence: 'SOP-13 §11.2', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '11-deployment-and-infrastructure', status: 'partial' },
    { criterion: 'CC7.2', description: 'Monitoring', control: 'Vercel logs + Sentry + rag_query_log + audit_event', evidence: 'SOP-13 §12', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '12-observability-and-monitoring', status: 'implemented' },
    { criterion: 'CC7.3', description: 'Incident response', control: 'Runbook + Sentry alerts + rollback capability', evidence: 'docs/incident-response-runbook.md', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '13-data-security-and-encryption-soc2-grade', status: 'implemented' },
    { criterion: 'CC7.5', description: 'Recovery', control: 'Daily backups + PITR + Vercel one-click rollback', evidence: 'SOP-13 §14', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '14-backup-and-disaster-recovery', status: 'implemented' },
    { criterion: 'CC8.1', description: 'Continuous system monitoring', control: 'Real-time logs + error tracking + cron health checks', evidence: 'SOP-13 §12', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '12-observability-and-monitoring', status: 'partial' },
    { criterion: 'CC9.1', description: 'Risk management', control: 'SOP-13 + quarterly architecture review (planned)', evidence: 'SOP-13 §17-18', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '17-known-issues-and-technical-debt', status: 'partial' },
    { criterion: 'CC9.2', description: 'Vendor management', control: 'Stripe / Supabase / Vercel / OpenAI / Cohere / Google — all SOC2-compliant providers', evidence: 'SOP-13 §15.1', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '15-soc2-type-ii-compliance-posture', status: 'implemented' },
  ],
  'Availability (A)': [
    { criterion: 'A1.1', description: 'Availability commitments', control: 'Vercel 99.99% SLA + Supabase 99.9% SLA', evidence: 'SOP-13 §15.2', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '15-soc2-type-ii-compliance-posture', status: 'implemented' },
    { criterion: 'A1.2', description: 'System monitoring', control: 'Vercel analytics + Sentry alerts on error spikes', evidence: 'SOP-13 §12.4', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '12-observability-and-monitoring', status: 'partial' },
    { criterion: 'A1.3', description: 'Backup + DR', control: 'See SOP-13 §14 + DR runbook', evidence: 'docs/disaster-recovery-runbook.md', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '14-backup-and-disaster-recovery', status: 'partial' },
  ],
  'Confidentiality (C)': [
    { criterion: 'C1.1', description: 'Data classification', control: 'Iron Wall — persona × type matrix; owner_visible boolean enforced at RLS + API + UI', evidence: 'SOP-14 §4-5', sopSlug: '14-document-persona-architecture', sopSection: '4-the-iron-wall-matrix', status: 'implemented' },
    { criterion: 'C1.2', description: 'Data disposal', control: 'Account deletion soft-deletes; hard-delete after 30-day retention via /api/cron/trash-purge', evidence: 'SOP-12 §11.3', sopSlug: '12-owner-portal-experience', sopSection: '11-owner-privacy-and-data-rights', status: 'partial' },
  ],
  'Processing Integrity (PI)': [
    { criterion: 'PI1.1', description: 'Complete and accurate processing', control: 'Input validation (Zod) + state machines on critical entities', evidence: 'SOP-13 §10', sopSlug: '13-fullstack-architecture-rag-admin', sopSection: '10-api-design-and-security', status: 'implemented' },
    { criterion: 'PI1.4', description: 'Audit trail', control: 'Immutable audit_event table; e_signature_audit for logbook entries', evidence: 'SOP-12 §15 + SOP-10 §11.3', sopSlug: '12-owner-portal-experience', sopSection: '15-compliance-and-audit-trail', status: 'implemented' },
  ],
  'Privacy (P)': [
    { criterion: 'P3.1', description: 'Consent', control: 'Terms of service accepted at signup; privacy policy linked from footer', evidence: 'SOP-12 §3.2', sopSlug: '12-owner-portal-experience', sopSection: '3-owner-onboarding-flow', status: 'implemented' },
    { criterion: 'P5.1', description: 'Disclosure of practices', control: 'Privacy policy at /legal/privacy', evidence: 'SOP-12 §11', sopSlug: '12-owner-portal-experience', sopSection: '11-owner-privacy-and-data-rights', status: 'implemented' },
    { criterion: 'P8.1', description: 'Data subject rights', control: 'Account deletion request + data export', evidence: 'SOP-12 §11.3', sopSlug: '12-owner-portal-experience', sopSection: '11-owner-privacy-and-data-rights', status: 'partial' },
  ],
}

const STATUS_STYLES: Record<ControlRow['status'], { tint: string; label: string }> = {
  implemented: { tint: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', label: 'Implemented' },
  partial: { tint: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Partial' },
  gap: { tint: 'bg-rose-500/15 text-rose-300 border-rose-500/30', label: 'Gap' },
}

export default async function CompliancePage() {
  // Load the SOP list so we can show a count + last-update line.
  const sops = await listSops()
  const totalControls = Object.values(CONTROLS).reduce((n, arr) => n + arr.length, 0)
  const implemented = Object.values(CONTROLS).flat().filter((c) => c.status === 'implemented').length
  const partial = Object.values(CONTROLS).flat().filter((c) => c.status === 'partial').length
  const gaps = Object.values(CONTROLS).flat().filter((c) => c.status === 'gap').length

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <Link
        href="/sop-library"
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Library
      </Link>

      <header className="mb-6 pb-5 border-b border-slate-800">
        <div className="flex items-center gap-2 text-emerald-300 mb-2">
          <ShieldCheck className="w-4 h-4" />
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">SOC2 Type II Posture</span>
        </div>
        <h1 className="text-3xl font-semibold text-white tracking-tight mb-2">
          Compliance Control Matrix
        </h1>
        <p className="text-sm text-slate-400 max-w-3xl">
          Every SOC2 Trust Service Criterion that touches myaircraft.us, mapped to the
          control that satisfies it and the SOP section that documents the evidence.
          This page is the auditor-facing deliverable referenced by SOP-13 §15.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span>{sops.length} SOPs</span>
          <span className="text-slate-700">·</span>
          <span>{totalControls} controls mapped</span>
          <span className="text-slate-700">·</span>
          <span className="text-emerald-300">{implemented} implemented</span>
          <span className="text-slate-700">·</span>
          <span className="text-amber-300">{partial} partial</span>
          {gaps > 0 && (
            <>
              <span className="text-slate-700">·</span>
              <span className="text-rose-300">{gaps} gaps</span>
            </>
          )}
        </div>
      </header>

      <div className="space-y-8">
        {Object.entries(CONTROLS).map(([category, rows]) => (
          <section key={category}>
            <h2 className="text-base font-semibold text-white mb-3">{category}</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0f172a]">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-[0.1em]">
                  <tr>
                    <th className="text-left px-3 py-2 border-b border-slate-800">Criterion</th>
                    <th className="text-left px-3 py-2 border-b border-slate-800">Description</th>
                    <th className="text-left px-3 py-2 border-b border-slate-800">Control</th>
                    <th className="text-left px-3 py-2 border-b border-slate-800">Evidence</th>
                    <th className="text-left px-3 py-2 border-b border-slate-800">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={`${row.criterion}-${i}`} className={i > 0 ? 'border-t border-slate-800/60' : ''}>
                      <td className="px-3 py-2.5 font-mono text-slate-300 align-top">{row.criterion}</td>
                      <td className="px-3 py-2.5 text-slate-200 align-top">{row.description}</td>
                      <td className="px-3 py-2.5 text-slate-400 align-top">{row.control}</td>
                      <td className="px-3 py-2.5 align-top">
                        <Link
                          href={`/sop-library/${row.sopSlug}${row.sopSection ? `#${row.sopSection}` : ''}`}
                          className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors"
                        >
                          {row.evidence}
                          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className={`inline-block text-[10px] uppercase tracking-wider font-semibold rounded border px-1.5 py-0.5 ${STATUS_STYLES[row.status].tint}`}>
                          {STATUS_STYLES[row.status].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <section className="mt-10 pt-6 border-t border-slate-800">
        <h2 className="text-base font-semibold text-white mb-3">Operational runbooks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            href="https://github.com/myaircraftus/claude/blob/main/docs/incident-response-runbook.md"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-slate-800 bg-[#0f172a] hover:border-slate-700 hover:bg-[#131c2e] p-4 transition-colors"
          >
            <div className="text-xs font-semibold text-white mb-1">Incident Response Runbook</div>
            <div className="text-[11px] text-slate-400">P0 / P1 / P2 / P3 severity classification, security incident playbook, post-mortem template.</div>
          </Link>
          <Link
            href="https://github.com/myaircraftus/claude/blob/main/docs/disaster-recovery-runbook.md"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-slate-800 bg-[#0f172a] hover:border-slate-700 hover:bg-[#131c2e] p-4 transition-colors"
          >
            <div className="text-xs font-semibold text-white mb-1">Disaster Recovery Runbook</div>
            <div className="text-[11px] text-slate-400">RTO 4h · RPO 5min · Supabase PITR · Vercel rollback · per-scenario recovery decision trees.</div>
          </Link>
        </div>
      </section>

      <section className="mt-8 pt-6 border-t border-slate-800">
        <h2 className="text-base font-semibold text-white mb-3">Audit gaps to close before SOC2 Type II</h2>
        <ul className="space-y-2 text-sm text-slate-300">
          <li>• Penetration testing — not yet performed (planned engagement)</li>
          <li>• Cross-region database replication — single region (us-east-2) only</li>
          <li>• Customer data export (GDPR Article 20) — API exists, UI pending</li>
          <li>• Formal vendor due-diligence packets — collected but not yet centralized</li>
          <li>• Synthetic uptime monitor — planned <code className="text-amber-300 bg-slate-800/60 px-1 rounded">status.myaircraft.us</code></li>
        </ul>
      </section>

      <footer className="mt-10 pt-6 border-t border-slate-800 text-[10px] text-slate-500">
        This matrix is generated from SOP-12, SOP-13, SOP-14 and the operational runbooks.
        Each row links to the SOP section that documents the evidence in detail.
        Last reviewed: 2026-05-21.
      </footer>
    </div>
  )
}
