'use client'

import { useState } from 'react'
import Link from '@/components/shared/tenant-link'
import {
  ArrowLeft,
  BookOpen,
  Wrench,
  CheckCircle2,
  Plane,
  Calendar,
  Gauge,
  ScrollText,
  AlertTriangle,
  ExternalLink,
  FileText,
  Printer,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LogbookEntryRecord {
  id: string
  entry_date: string | null
  entry_type: string | null
  logbook_type: string | null
  status: string | null
  description: string | null
  tach_time: number | string | null
  total_time: number | string | null
  hobbs_in: number | string | null
  hobbs_out: number | string | null
  parts_used: any[] | null
  references_used: any[] | null
  ad_numbers: string[] | null
  mechanic_name: string | null
  mechanic_cert_number: string | null
  cert_type: string | null
  target_logbook: string | null
  source_type: string | null
  source_references: Record<string, any> | null
  certificate_number: string | null
  certificate_type: string | null
  ia_flag: boolean | null
  revision_number: number | null
  entry_hash: string | null
  pdf_hash: string | null
  signature_reason: string | null
  owner_visible: boolean | null
  ai_review_status: string | null
  signature_audit: Record<string, any> | null
  signed_at: string | null
  signed_by: string | null
  work_order_id: string | null
  work_order_ref: string | null
  created_at: string | null
  updated_at: string | null
  aircraft: {
    id: string
    tail_number: string | null
    make: string | null
    model: string | null
    year: number | null
  } | null
  work_order: {
    id: string
    work_order_number: string | null
    service_type: string | null
    status: string | null
  } | null
  signature_certificate?: Record<string, any> | null
  source_bundle?: Array<Record<string, any>> | Record<string, any> | null
  revisions?: Array<Record<string, any>> | null
  output_events?: Array<Record<string, any>> | null
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

function statusColor(status: string | null) {
  if (!status) return 'bg-slate-50 text-slate-700 border-slate-200'
  if (status === 'signed') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'published_to_owner') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'ready_to_sign') return 'bg-indigo-50 text-indigo-700 border-indigo-200'
  if (status === 'ready_for_review') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (status === 'draft') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

export function LogbookEntryDetail({ entry }: { entry: LogbookEntryRecord }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const aircraft = entry.aircraft
  const wo = entry.work_order
  const description = entry.description ?? ''
  const adNumbers = entry.ad_numbers ?? []
  const refs = entry.references_used ?? []
  const parts = entry.parts_used ?? []
  const sourceBundle = Array.isArray(entry.source_bundle) ? entry.source_bundle[0] : entry.source_bundle
  const signatureCertificate = entry.signature_certificate

  async function updateStatus(status: string) {
    setBusy(status)
    setError(null)
    try {
      const res = await fetch(`/api/logbook-entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? `Update failed (${res.status})`)
        return
      }
      window.location.reload()
    } finally {
      setBusy(null)
    }
  }

  async function signEntry() {
    const mechanicName = entry.mechanic_name
    const certificateNumber = entry.mechanic_cert_number ?? entry.certificate_number
    const certificateType = entry.cert_type ?? entry.certificate_type
    if (!mechanicName || !certificateNumber || !certificateType) {
      setError('Mechanic name, certificate number, and certificate type are required before signing.')
      return
    }
    setBusy('sign')
    setError(null)
    try {
      const res = await fetch(`/api/logbook-entries/${entry.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mechanic_name: mechanicName,
          mechanic_cert_number: certificateNumber,
          cert_type: certificateType,
          ia_flag: entry.ia_flag,
          signature_reason: entry.signature_reason ?? 'Return to service',
          confirm_missing_time: true,
          signature_audit: { signature_type: 'typed' },
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? `Sign failed (${res.status})`)
        return
      }
      window.location.reload()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Link
          href={aircraft ? `/aircraft/${aircraft.id}` : '/aircraft'}
          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {aircraft?.tail_number ?? 'Aircraft'}
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span>Logbook entry</span>
      </div>

      {/* Header */}
      <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <BookOpen className="w-4 h-4 text-primary" />
              <h1 className="text-[20px] text-foreground" style={{ fontWeight: 700 }}>
                {entry.entry_type
                  ? entry.entry_type.charAt(0).toUpperCase() + entry.entry_type.slice(1)
                  : 'Logbook entry'}
              </h1>
              {(entry.target_logbook || entry.logbook_type) && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200" style={{ fontWeight: 600 }}>
                  {entry.target_logbook ?? entry.logbook_type}
                </span>
              )}
              {entry.status && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColor(entry.status)}`} style={{ fontWeight: 600 }}>
                  {entry.status}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[12px] text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> {formatDate(entry.entry_date)}
              </span>
              {aircraft && (
                <Link
                  href={`/aircraft/${aircraft.id}`}
                  className="inline-flex items-center gap-1 text-primary hover:text-primary/80"
                  style={{ fontWeight: 500 }}
                >
                  <Plane className="w-3.5 h-3.5" /> {aircraft.tail_number}
                  {aircraft.make && aircraft.model ? (
                    <span className="text-muted-foreground/80 ml-1">
                      · {aircraft.make} {aircraft.model}
                      {aircraft.year ? ` · ${aircraft.year}` : ''}
                    </span>
                  ) : null}
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {entry.status !== 'signed' && entry.status !== 'published_to_owner' && (
              <>
                <Button size="sm" variant="outline" onClick={() => updateStatus('ready_to_sign')} disabled={Boolean(busy)}>
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Ready
                </Button>
                <Button size="sm" onClick={signEntry} disabled={Boolean(busy)}>
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Sign
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => updateStatus('printed_unsigned')} disabled={Boolean(busy)}>
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print Unsigned
            </Button>
            {entry.status === 'signed' && (
              <Button size="sm" variant="outline" onClick={() => updateStatus('published_to_owner')} disabled={Boolean(busy)}>
                <Send className="mr-1.5 h-3.5 w-3.5" /> Publish Owner
              </Button>
            )}
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
            {error}
          </div>
        )}

        {/* Time stack */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border">
          {[
            { label: 'Tach', value: entry.tach_time, icon: Gauge },
            { label: 'Total time', value: entry.total_time, icon: Gauge },
            { label: 'Hobbs in', value: entry.hobbs_in, icon: Gauge },
            { label: 'Hobbs out', value: entry.hobbs_out, icon: Gauge },
          ].map((m) => (
            <div key={m.label} className="bg-muted/30 rounded-lg p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5" style={{ fontWeight: 600 }}>
                {m.label}
              </div>
              <div className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
                {m.value != null && m.value !== '' ? m.value : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Source bundle */}
      <div className="bg-white border border-border rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
            Source Bundle
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <InfoTile label="Source" value={entry.source_type ?? (entry.work_order_id ? 'work_order' : 'manual')} />
          <InfoTile label="Revision" value={entry.revision_number ? `Rev ${entry.revision_number}` : 'Rev 1'} />
          <InfoTile label="AI Review" value={entry.ai_review_status ?? 'draft'} />
          <InfoTile label="Owner Visible" value={entry.owner_visible ? 'Yes' : 'No'} />
        </div>
        {sourceBundle?.source_snapshot && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">
            <span style={{ fontWeight: 600 }}>Mapped facts:</span>{' '}
            {sourceBundle.source_snapshot?.lines?.length ?? 0} work-order lines ·{' '}
            {sourceBundle.source_snapshot?.checklist?.length ?? 0} checklist items · source refs retained
          </div>
        )}
      </div>

      {/* Description */}
      <div className="bg-white border border-border rounded-2xl p-6 space-y-2">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-primary" />
          <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
            Description
          </h2>
        </div>
        {description ? (
          <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
            {description}
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground italic">No description recorded.</p>
        )}
      </div>

      {/* AD numbers */}
      {adNumbers.length > 0 && (
        <div className="bg-white border border-border rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
              Airworthiness Directives
            </h2>
            <span className="text-[11px] text-muted-foreground">({adNumbers.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {adNumbers.map((ad) => (
              <span
                key={ad}
                className="text-[11px] px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200 font-mono"
              >
                {ad}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* References */}
      {refs.length > 0 && (
        <div className="bg-white border border-border rounded-2xl p-6 space-y-3">
          <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
            References
          </h2>
          <ul className="text-[12px] space-y-1 text-foreground/90">
            {refs.map((r: any, i: number) => (
              <li key={i} className="font-mono">
                {typeof r === 'string' ? r : JSON.stringify(r)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Parts */}
      {parts.length > 0 && (
        <div className="bg-white border border-border rounded-2xl p-6 space-y-3">
          <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
            Parts used
          </h2>
          <ul className="space-y-1 text-[12px] text-foreground/90">
            {parts.map((p: any, i: number) => (
              <li key={i} className="flex items-center gap-2 border-b border-border/40 pb-1 last:border-0">
                <span className="font-mono">{p.part_number ?? p.pn ?? '—'}</span>
                <span className="flex-1 text-muted-foreground">
                  {p.description ?? p.desc ?? ''}
                </span>
                {(p.quantity ?? p.qty) != null && (
                  <span className="text-muted-foreground">qty {p.quantity ?? p.qty}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Linked work order */}
      {wo && (
        <Link
          href={`/work-orders/${wo.id}`}
          className="block bg-white border border-border rounded-2xl p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
              <Wrench className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                  {wo.work_order_number ?? entry.work_order_ref ?? 'Linked work order'}
                </span>
                {wo.status && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-200" style={{ fontWeight: 600 }}>
                    {wo.status}
                  </span>
                )}
              </div>
              {wo.service_type && (
                <p className="text-[11px] text-muted-foreground">{wo.service_type}</p>
              )}
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground/60" />
          </div>
        </Link>
      )}

      {/* Sign-off */}
      {(entry.mechanic_name || entry.signed_at) && (
        <div className="bg-emerald-50/40 border border-emerald-200/50 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="text-[12px] text-foreground/90">
              {entry.mechanic_name && (
                <span style={{ fontWeight: 600 }}>{entry.mechanic_name}</span>
              )}
              {entry.cert_type && entry.mechanic_cert_number && (
                <span className="text-muted-foreground ml-2">
                  · {entry.cert_type} #{entry.mechanic_cert_number}
                </span>
              )}
              {entry.signed_at && (
                <span className="text-muted-foreground ml-2">
                  · signed {formatDate(entry.signed_at)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Signature certificate */}
      {(signatureCertificate || entry.entry_hash || entry.signature_audit) && (
        <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
              Signature Certificate
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 text-[12px]">
              <CertificateRow label="Signer" value={signatureCertificate?.signer_name ?? entry.mechanic_name ?? '—'} />
              <CertificateRow label="Certificate" value={signatureCertificate?.certificate_number ?? entry.certificate_number ?? entry.mechanic_cert_number ?? '—'} />
              <CertificateRow label="Type" value={signatureCertificate?.certificate_type ?? entry.certificate_type ?? entry.cert_type ?? '—'} />
              <CertificateRow label="IA" value={entry.ia_flag ? 'Yes' : 'No'} />
              <CertificateRow label="Signed" value={formatDate(signatureCertificate?.signed_at ?? entry.signed_at)} />
            </div>
            <div className="space-y-2 text-[12px]">
              <CertificateRow label="Entry Hash" value={(entry.entry_hash ?? signatureCertificate?.entry_hash ?? '—').slice(0, 18)} />
              <CertificateRow label="PDF Hash" value={(entry.pdf_hash ?? signatureCertificate?.pdf_hash ?? '—').slice(0, 18)} />
              <CertificateRow label="IP" value={signatureCertificate?.ip_address ?? entry.signature_audit?.ip_address ?? 'captured at sign'} />
              <CertificateRow label="MFA" value={signatureCertificate?.mfa_event_id ?? entry.signature_audit?.mfa_event_id ?? 'when available'} />
              <CertificateRow label="MAC Address" value="Not captured in browser" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5" style={{ fontWeight: 600 }}>
        {label}
      </div>
      <div className="text-[13px] text-foreground capitalize" style={{ fontWeight: 600 }}>
        {value.replace(/_/g, ' ')}
      </div>
    </div>
  )
}

function CertificateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-foreground">{value}</span>
    </div>
  )
}
