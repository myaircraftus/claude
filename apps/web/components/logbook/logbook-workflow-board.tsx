'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Link, { useTenantRouter } from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn, formatDate } from '@/lib/utils'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  Mail,
  Printer,
  Search,
} from 'lucide-react'

type Props = {
  entries: any[]
  workOrders: any[]
  aircraft: any[]
  profile: any
}

const FLOW_STEPS = [
  ['Open Logbook', 'All entries or aircraft-specific list'],
  ['Choose Source', 'Work order, aircraft, template, manual'],
  ['Select Logbook', 'Airframe, engine, prop, avionics'],
  ['AI Draft', 'WO facts, AD/SB, tasks, parts'],
  ['Review', 'Human edits and confirms wording'],
  ['Sign', 'Profile cert info + audit certificate'],
  ['Output', 'Print unsigned or send signed PDF/link'],
]

const SOURCES = [
  ['work_order', 'From Work Order', 'Auto-pulls aircraft, times, tasks, checklist results, parts installed, AD/SB review, AI summary, invoice/work-order references.', 'Best / most accurate'],
  ['aircraft', 'From Aircraft', 'Aircraft is locked. User selects work order or creates manual/template entry against the aircraft.', 'Aircraft context'],
  ['logbook_module', 'From Logbook Module', 'User must select aircraft first, then optionally select work order or template.', 'General creation'],
  ['manual', 'Manual Entry', 'Requires aircraft, logbook type, date, time, description, signer, and certificate details.', 'Fallback'],
] as const

const TARGETS = [
  ['airframe', 'Airframe', 'Annual inspection, structural, landing gear, AD/SB airframe items', 'bg-blue-50 text-blue-700'],
  ['engine', 'Engine', 'Oil change, compression, engine inspection, engine AD/SB', 'bg-emerald-50 text-emerald-700'],
  ['propeller', 'Propeller', 'Prop inspection, servicing, prop AD/SB', 'bg-violet-50 text-violet-700'],
  ['avionics', 'Avionics', 'Radio, transponder, ADS-B, electrical/avionics work', 'bg-amber-50 text-amber-700'],
  ['appliance', 'Appliance', 'ELT, battery, instruments, component-specific work', 'bg-slate-100 text-slate-700'],
] as const

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  ready_for_review: 'bg-blue-50 text-blue-700 border-blue-200',
  ready_to_sign: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  signed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  published_to_owner: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  needs_review: 'bg-red-50 text-red-700 border-red-200',
  superseded: 'bg-slate-100 text-slate-600 border-slate-200',
}

function labelize(value: string | null | undefined) {
  return String(value ?? '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

/** Format a logbook entry date as MM/DD/YYYY (SOP 07). Handles a plain
 *  YYYY-MM-DD date column without timezone shifting, and ISO timestamps. */
function formatEntryDate(date: string | null | undefined): string {
  if (!date) return '—'
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date))
  if (ymd) return `${ymd[2]}/${ymd[3]}/${ymd[1]}`
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

export function LogbookWorkflowBoard({ entries, workOrders, aircraft, profile }: Props) {
  const router = useTenantRouter()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceType, setSourceType] = useState<'work_order' | 'aircraft' | 'logbook_module' | 'manual'>('work_order')
  const [aircraftId, setAircraftId] = useState(aircraft[0]?.id ?? '')
  const [workOrderId, setWorkOrderId] = useState('')
  const [targets, setTargets] = useState(['airframe'])
  const [template, setTemplate] = useState('annual')
  const [entryType, setEntryType] = useState('annual')
  const [draftText, setDraftText] = useState('')
  const [signerName, setSignerName] = useState(profile?.full_name ?? profile?.name ?? 'John Doe')
  const [certNumber, setCertNumber] = useState(profile?.certificate_number ?? profile?.mechanic_cert_number ?? '')
  const [certType, setCertType] = useState(profile?.certificate_type ?? profile?.cert_type ?? 'A&P')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedAircraft = aircraft.find(item => item.id === aircraftId)
  const aircraftWorkOrders = workOrders.filter(wo => !aircraftId || wo.aircraft_id === aircraftId)
  const selectedWorkOrder = workOrders.find(wo => wo.id === workOrderId) ?? aircraftWorkOrders[0]
  const sourceAircraftId = sourceType === 'work_order' ? selectedWorkOrder?.aircraft_id ?? aircraftId : aircraftId
  const activeAircraft = aircraft.find(item => item.id === sourceAircraftId) ?? selectedAircraft
  const sourceLines = selectedWorkOrder?.lines ?? []
  const checklist = selectedWorkOrder?.checklist ?? []

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return entries.filter(entry => {
      const matchesStatus = statusFilter === 'all' || entry.status === statusFilter
      if (!matchesStatus) return false
      if (!needle) return true
      return [
        entry.id,
        entry.entry_type,
        entry.status,
        entry.target_logbook,
        entry.logbook_type,
        entry.aircraft?.tail_number,
        entry.work_order?.work_order_number,
        entry.description,
      ].some(value => String(value ?? '').toLowerCase().includes(needle))
    })
  }, [entries, query, statusFilter])

  const stats = useMemo(() => ({
    draft: entries.filter(entry => entry.status === 'draft').length,
    signed: entries.filter(entry => entry.status === 'signed' || entry.status === 'published_to_owner').length,
    fromWorkOrder: entries.filter(entry => entry.work_order_id || entry.source_type === 'work_order').length,
    needsReview: entries.filter(entry => ['ready_for_review', 'needs_review'].includes(entry.status) || entry.ai_review_status === 'needs_review').length,
  }), [entries])

  const suggestedDraft = draftText || buildPreviewDraft(selectedWorkOrder, targets[0], entryType, sourceLines, checklist)

  async function createEntries() {
    setCreating(true)
    setError(null)
    try {
      const targetList = targets.length ? targets : ['airframe']
      const created: any[] = []
      for (const target of targetList) {
        const payload: Record<string, unknown> = {
          aircraft_id: sourceAircraftId,
          work_order_id: sourceType === 'work_order' ? selectedWorkOrder?.id : undefined,
          source_type: sourceType,
          source_id: sourceType === 'work_order' ? selectedWorkOrder?.id : sourceAircraftId,
          entry_type: entryType,
          entry_date: new Date().toISOString().slice(0, 10),
          target_logbook: target,
          logbook_type: target === 'propeller' ? 'prop' : target,
          status: 'ready_for_review',
          description: draftText || undefined,
          mechanic_name: signerName || undefined,
          mechanic_cert_number: certNumber || undefined,
          cert_type: certType || undefined,
          source_context: {
            source_context: 'logbook_module',
            launch_route: '/logbook-entries',
            aircraft_id: sourceAircraftId,
            tail_number: activeAircraft?.tail_number,
            work_order_id: selectedWorkOrder?.id ?? null,
          },
        }
        const res = await fetch('/api/logbook-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setError(data?.error ?? `Create failed (${res.status})`)
          return
        }
        created.push(data)
      }
      if (created[0]?.id) router.push(`/logbook-entries/${created[0].id}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-[1760px] px-5 py-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-normal text-slate-950">
              Logbook Entries - AI-Assisted, Component-Specific, Signed Records
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Generate airframe, engine, propeller, and avionics logbook entries from work orders, aircraft records, templates, or manual creation.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">Import</Button>
            <Button variant="outline" size="sm">Filter</Button>
            <Button variant="outline" size="sm">Templates</Button>
            <Button size="sm" onClick={createEntries} disabled={creating || !sourceAircraftId}>
              + Entry
            </Button>
          </div>
        </div>

        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-950">Logbook Entry Flow</h2>
          <div className="grid gap-3 lg:grid-cols-7">
            {FLOW_STEPS.map(([title, copy], index) => (
              <div key={title} className="flex items-center gap-3">
                <div className="min-h-[64px] flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{index + 1}</span>
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                  </div>
                  <p className="ml-8 mt-1 text-xs text-slate-500">{copy}</p>
                </div>
                {index < FLOW_STEPS.length - 1 && <ArrowRight className="hidden h-5 w-5 shrink-0 text-blue-600 lg:block" />}
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr_1fr]">
          <Panel title="1. Logbook Entries Dashboard" subtitle="All signed, draft, and component-specific logbook records. Aircraft page shows filtered entries.">
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search aircraft, entry type, signer, work order, AD/SB..."
                className="w-full bg-transparent text-sm outline-none"
              />
              {['all', 'draft', 'signed', 'ready_for_review'].map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    'rounded-full px-2 py-1 text-xs font-medium',
                    statusFilter === status ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                  )}
                >
                  {labelize(status)}
                </button>
              ))}
            </div>
            <div className="mb-4 grid grid-cols-4 gap-3">
              {[
                ['Draft', stats.draft, 'View', 'bg-amber-50'],
                ['Signed', stats.signed, 'View', 'bg-emerald-50'],
                ['From WO', stats.fromWorkOrder, 'View', 'bg-blue-50'],
                ['Needs Review', stats.needsReview, 'View', 'bg-red-50'],
              ].map(([label, value, action, bg]) => (
                <div key={label as string} className={cn('rounded-lg border border-slate-200 p-3', bg as string)}>
                  <p className="text-xl font-bold text-slate-950">{value}</p>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-slate-500">{label}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-blue-600">{action}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Entry</th>
                    <th className="px-3 py-2 text-left">Aircraft</th>
                    <th className="px-3 py-2 text-left">Logbook</th>
                    <th className="px-3 py-2 text-left">Source</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredEntries.slice(0, 7).map(entry => (
                    <tr key={entry.id} className="hover:bg-blue-50">
                      <td className="px-3 py-3">
                        {/* Human-readable entry label (SOP 07) — entry type +
                            date + signer — instead of a raw UUID fragment. */}
                        <Link href={`/logbook-entries/${entry.id}`} className="block">
                          <span className="text-xs font-semibold text-blue-700">
                            {labelize(entry.entry_type) || 'Logbook Entry'}
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            {formatEntryDate(entry.entry_date)}
                            {entry.mechanic_name
                              ? ` · ${entry.mechanic_name}`
                              : entry.mechanic_cert_number
                                ? ` · ${entry.mechanic_cert_number}`
                                : ''}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700">{entry.aircraft?.tail_number ?? 'Unassigned'}</td>
                      <td className="px-3 py-3 text-xs text-slate-700">{labelize(entry.target_logbook ?? entry.logbook_type ?? 'airframe')}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{entry.work_order?.work_order_number ?? labelize(entry.source_type)}</td>
                      <td className="px-3 py-3">
                        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_STYLE[entry.status] ?? STATUS_STYLE.draft)}>
                          {labelize(entry.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="2. Create Entry - Choose Source" subtitle="Creation behavior changes depending on where the user starts.">
            <div className="grid gap-3">
              {SOURCES.map(([key, title, copy, badge]) => (
                <button
                  key={key}
                  onClick={() => setSourceType(key)}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors',
                    sourceType === key ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:bg-white'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-950">{title}</p>
                      <p className="mt-1 text-xs text-slate-500">{copy}</p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-blue-600">{badge}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Rule: if no work order exists, create a manual/template entry, but AI has less source context.
            </div>
          </Panel>

          <Panel title="3. Auto-Mapped From Work Order" subtitle="Work order is the strongest source because it contains actual completed work.">
            <div className="grid grid-cols-3 gap-3">
              <SelectBox label="Aircraft *" value={sourceAircraftId ?? ''} onChange={setAircraftId} options={aircraft.map(item => ({ value: item.id, label: `${item.tail_number} - ${item.make ?? ''} ${item.model ?? ''}`.trim() }))} lock />
              <SelectBox label="Work Order *" value={workOrderId || selectedWorkOrder?.id || ''} onChange={setWorkOrderId} options={aircraftWorkOrders.map(item => ({ value: item.id, label: item.work_order_number ?? item.id }))} lock />
              <InputBlock label="Generated By *" value={signerName} onChange={setSignerName} lock />
              <InputBlock label="Tach" value={String(selectedWorkOrder?.tach_time ?? '')} onChange={() => {}} lock />
              <InputBlock label="Hobbs" value={String(selectedWorkOrder?.hobbs_time ?? '')} onChange={() => {}} lock />
              <SelectBox label="Entry Type *" value={entryType} onChange={setEntryType} options={[
                { value: 'annual', label: 'Annual Inspection' },
                { value: 'maintenance', label: 'Maintenance' },
                { value: 'oil_change', label: 'Oil Change' },
                { value: 'ad_compliance', label: 'AD Compliance' },
                { value: 'return_to_service', label: 'Return to Service' },
              ]} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ['Tasks', `${sourceLines.filter((line: any) => line.line_type === 'labor').length} labor lines, ${sourceLines.filter((line: any) => line.line_type === 'part').length} parts`],
                ['Checklist', `${checklist.filter((item: any) => item.completed).length}/${checklist.length} complete`],
                ['Parts', sourceLines.filter((line: any) => line.line_type === 'part').map((line: any) => line.description).slice(0, 2).join(', ') || 'No installed parts selected'],
                ['AD/SB', 'Applicability and compliance refs attach here'],
                ['AI Summary', 'WO findings, corrective action, RTS wording'],
                ['Attachments', 'Photos, paper checklist, inspection file'],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">{title}</p>
                  <p className="mt-1 text-xs text-slate-700">{copy}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              AI will generate a draft entry using template + work-order facts + AD/SB + checklist. Human review remains required.
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={createEntries} disabled={creating || !sourceAircraftId}>Generate Draft</Button>
              <Button size="sm" variant="outline">Use Template</Button>
              <Button size="sm" variant="outline">Manual Edit</Button>
            </div>
          </Panel>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr_1fr]">
          <Panel title="4. Component Logbook Target" subtitle="One work order may generate several entries. Each entry must go to the correct logbook.">
            <div className="space-y-3">
              {TARGETS.map(([key, title, copy, chip]) => (
                <label key={key} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={targets.includes(key)}
                      onChange={event => {
                        setTargets(prev => event.target.checked ? [...new Set([...prev, key])] : prev.filter(item => item !== key))
                      }}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <div>
                      <p className="text-base font-semibold text-slate-950">{title}</p>
                      <p className="text-xs text-slate-500">{copy}</p>
                    </div>
                  </div>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs', chip)}>Target</span>
                </label>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-blue-200 bg-white p-3 text-sm text-slate-700">
              Template rule: shop-approved templates are used first. AI may supplement missing AD/SB, parts, checklist, and compliance details, but signer must review.
            </div>
          </Panel>

          <Panel title="5. AI Draft + Human Review" subtitle="Template and AI summary merge into an editable entry. Human signer owns final wording.">
            <div className="grid grid-cols-3 gap-3">
              <SelectBox label="Template *" value={template} onChange={setTemplate} options={[
                { value: 'annual', label: 'Annual Inspection' },
                { value: 'maintenance', label: 'Maintenance' },
                { value: 'oil_change', label: 'Oil Change' },
              ]} />
              <SelectBox label="Target Logbook *" value={targets[0] ?? 'airframe'} onChange={value => setTargets([value])} options={TARGETS.map(([key, title]) => ({ value: key, label: title }))} />
              <InputBlock label="Status" value="Draft" onChange={() => {}} lock />
            </div>
            <Label className="mt-4 block text-sm font-semibold text-slate-950">Suggested Logbook Entry</Label>
            <textarea
              value={suggestedDraft}
              onChange={event => setDraftText(event.target.value)}
              className="mt-2 min-h-[260px] w-full rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 outline-none focus:border-blue-300"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setDraftText(buildPreviewDraft(selectedWorkOrder, targets[0], entryType, sourceLines, checklist))}>Regenerate</Button>
              <Button size="sm" variant="outline">Insert AD/SB</Button>
              <Button size="sm" variant="outline">Compare Template</Button>
              <Button size="sm" onClick={createEntries} disabled={creating || !sourceAircraftId}>Ready to Sign</Button>
            </div>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              AI warning: verify exact AD/SB applicability and certificate authority before signing.
            </div>
          </Panel>

          <Panel title="6. Digital Signature + Certificate" subtitle="Signer profile fills name, certificate number, certificate type, and IA flag automatically.">
            <div className="grid grid-cols-3 gap-3">
              <InputBlock label="Signer *" value={signerName} onChange={setSignerName} lock />
              <InputBlock label="Certificate *" value={certNumber} onChange={setCertNumber} lock />
              <SelectBox label="Certificate Type *" value={certType} onChange={setCertType} options={[
                { value: 'A&P', label: 'A&P' },
                { value: 'IA', label: 'IA' },
                { value: 'Repairman', label: 'Repairman' },
              ]} lock />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-950">Digital Signature</p>
                <div className="mt-4 rounded-lg border border-slate-200 p-5">
                  <p className="font-serif text-2xl text-slate-900">{signerName || 'John Doe'}</p>
                  <p className="mt-2 text-xs text-slate-500">{certType} {certNumber || '1234567'} - {formatDate(new Date().toISOString())}</p>
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-700">
                  {['Review final text', 'Confirm certificate profile', 'Confirm authority to sign', 'Verify identity / MFA', 'Click Sign Entry'].map(item => (
                    <p key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />{item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-950">Signature Certificate / Audit Trail</p>
                <div className="mt-4 space-y-2 text-xs text-slate-600">
                  <AuditRow label="Signer User ID" value="profile id" />
                  <AuditRow label="Full Name" value={signerName || 'John Doe'} />
                  <AuditRow label="Certificate" value={`${certNumber || 'A&P 1234567'} · ${certType}`} />
                  <AuditRow label="Timestamp" value="captured at sign" />
                  <AuditRow label="IP Address" value="captured server-side" />
                  <AuditRow label="Device/Browser" value="browser metadata" />
                  <AuditRow label="MFA Event" value="stored when available" />
                  <AuditRow label="Entry Hash" value="SHA-256" />
                  <AuditRow label="PDF Hash" value="SHA-256" />
                  <AuditRow label="Source Refs" value="WO, AD/SB, attachments" />
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              No browser MAC address capture: use IP, browser metadata, MFA, hashes, and immutable audit trail instead.
            </div>
          </Panel>
        </div>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-4 text-xl font-bold text-slate-950">7. Output, Print, Share, Notify & Source-of-Truth Rules</h2>
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_0.8fr]">
            <div className="grid gap-3">
              {[
                ['Print unsigned', 'Printed entry omits digital certificate so mechanic can physically sign.'],
                ['Send signed PDF/link', 'Signed package includes digital signature and certificate/audit package.'],
                ['Share with owner', 'Owner receives only final signed entries and allowed supporting docs.'],
                ['Aircraft timeline', 'Draft, generated, reviewed, signed, printed, emailed, and shared events appear on aircraft record.'],
              ].map(([title, copy]) => <RuleRow key={title} title={title} copy={copy} />)}
            </div>
            <div className="grid gap-3">
              {[
                ['Revision rule', 'After signing, edits create a new revision. Never silently overwrite signed records.'],
                ['Human authority', 'AI drafts only. Certificated signer is responsible for final logbook wording.'],
                ['Component rule', 'Airframe, engine, propeller, avionics, and appliance entries are stored separately when appropriate.'],
                ['Notification rule', 'Notify signer/lead when draft is ready, signed, sent, printed, or owner viewed/downloaded.'],
              ].map(([title, copy]) => <RuleRow key={title} title={title} copy={copy} />)}
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-950">Available Actions</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  [Printer, 'Print', 'Unsigned paper'],
                  [Mail, 'Email', 'Signed PDF'],
                  [FileText, 'Text Link', 'Secure link'],
                  [BookOpen, 'Download', 'PDF + cert'],
                ].map(([Icon, title, copy]: any) => (
                  <div key={title} className="rounded-lg border border-slate-200 bg-white p-3">
                    <Icon className="mb-2 h-4 w-4 text-blue-600" />
                    <p className="text-sm font-medium text-slate-900">{title}</p>
                    <p className="text-xs text-slate-500">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </section>
      </div>
    </main>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-slate-950">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

function SelectBox({
  label,
  value,
  onChange,
  options,
  lock,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  lock?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
        {label}
        {lock && <span className="text-[10px] uppercase text-slate-400">Lock</span>}
      </span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-blue-300"
      >
        <option value="">Select</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function InputBlock({
  label,
  value,
  onChange,
  lock,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  lock?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
        {label}
        {lock && <span className="text-[10px] uppercase text-slate-400">Lock</span>}
      </span>
      <Input value={value ?? ''} onChange={event => onChange(event.target.value)} className="bg-slate-50" />
    </label>
  )
}

function AuditRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-200 pb-1 last:border-0">
      <span className="font-medium text-slate-500">{label}</span>
      <span className="text-right text-slate-800">{value}</span>
    </div>
  )
}

function RuleRow({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{copy}</p>
    </div>
  )
}

function buildPreviewDraft(workOrder: any, target: string, entryType: string, lines: any[], checklist: any[]) {
  const woNumber = workOrder?.work_order_number ?? 'selected work order'
  const parts = lines.filter((line: any) => line.line_type === 'part').map((line: any) => line.description).slice(0, 3)
  const complete = checklist.filter((item: any) => item.completed).length
  const total = checklist.length
  return [
    entryType === 'annual'
      ? 'I certify that this aircraft has been inspected in accordance with an annual inspection and was determined to be in airworthy condition.'
      : `Completed ${labelize(entryType).toLowerCase()} for the ${labelize(target).toLowerCase()} logbook.`,
    `Work performed under ${woNumber}. ${workOrder?.findings ?? workOrder?.corrective_action ?? 'Reviewed work-order facts, checklist results, parts, and source references.'}`,
    parts.length ? `Parts/materials used: ${parts.join('; ')}.` : 'No installed parts are listed for this draft.',
    total ? `Checklist reviewed: ${complete}/${total} items complete.` : 'Checklist details will attach when available.',
    'All work documented here is limited to the scope performed and reviewed by the signer.',
  ].join('\n\n')
}
