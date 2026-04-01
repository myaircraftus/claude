'use client'

import { useState } from 'react'
import {
  X, FileText, ClipboardList, Receipt, Search, AlertTriangle,
  CheckCircle2, Clock, Copy, Download, Share2, Pencil, ChevronDown,
  ChevronRight, Info, Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ArtifactData } from './chat-shell'

interface Props {
  artifact: ArtifactData | null
  visible: boolean
  onClose: () => void
  selectedAircraft: { id: string; tail_number: string; make: string; model: string } | null
  orgId: string
  userId: string
}

export function ArtifactPanel({ artifact, visible, onClose, selectedAircraft }: Props) {
  if (!visible || !artifact || !artifact.type) return null

  return (
    <div className="w-[480px] flex-shrink-0 flex flex-col border-l border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80">
        <ArtifactIcon type={artifact.type} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground capitalize">
            {artifact.type.replace(/_/g, ' ')}
          </p>
          {selectedAircraft && (
            <p className="text-xs text-muted-foreground font-mono">{selectedAircraft.tail_number}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Copy"
            onClick={() => {
              if (artifact.data) navigator.clipboard.writeText(JSON.stringify(artifact.data, null, 2))
            }}
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {artifact.type === 'logbook_entry' && (
          <LogbookEntryArtifact
            data={artifact.data}
            missingFields={artifact.missingFields}
            complianceNotes={artifact.complianceNotes}
          />
        )}
        {artifact.type === 'work_order' && (
          <WorkOrderArtifact data={artifact.data} missingFields={artifact.missingFields} />
        )}
        {artifact.type === 'invoice' && (
          <InvoiceArtifact data={artifact.data} missingFields={artifact.missingFields} />
        )}
        {artifact.type === 'parts_search' && (
          <PartsSearchArtifact data={artifact.data} />
        )}
        {artifact.type === 'customer_card' && (
          <CustomerCardArtifact data={artifact.data} />
        )}
      </div>
    </div>
  )
}

function ArtifactIcon({ type }: { type: string }) {
  const base = 'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0'
  switch (type) {
    case 'logbook_entry':
      return <div className={cn(base, 'bg-blue-50')}><FileText className="h-4 w-4 text-blue-600" /></div>
    case 'work_order':
      return <div className={cn(base, 'bg-orange-50')}><Wrench className="h-4 w-4 text-orange-600" /></div>
    case 'invoice':
      return <div className={cn(base, 'bg-green-50')}><Receipt className="h-4 w-4 text-green-600" /></div>
    case 'parts_search':
      return <div className={cn(base, 'bg-purple-50')}><Search className="h-4 w-4 text-purple-600" /></div>
    default:
      return <div className={cn(base, 'bg-muted')}><ClipboardList className="h-4 w-4 text-muted-foreground" /></div>
  }
}

// ─── Missing Fields Banner ────────────────────────────────────────────────────

function MissingFieldsBanner({ fields }: { fields?: string[] }) {
  if (!fields || fields.length === 0) return null
  return (
    <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs font-medium text-amber-800">Missing required fields</p>
        <p className="text-xs text-amber-700 mt-0.5">
          {fields.join(', ')}
        </p>
      </div>
    </div>
  )
}

// ─── Compliance Notes ─────────────────────────────────────────────────────────

function ComplianceNotes({ notes }: { notes?: string[] }) {
  const [open, setOpen] = useState(true)
  if (!notes || notes.length === 0) return null
  return (
    <div className="mx-4 mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground w-full text-left"
      >
        <Info className="h-3.5 w-3.5 text-blue-500" />
        Compliance notes
        {open ? <ChevronDown className="h-3.5 w-3.5 ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {notes.map((note, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span className="mt-0.5 text-blue-400">•</span>
              {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Action Bar ───────────────────────────────────────────────────────────────

function ArtifactActions({ label, onSaveDraft, onFinalize }: {
  label: string
  onSaveDraft?: () => void
  onFinalize?: () => void
}) {
  return (
    <div className="sticky bottom-0 border-t border-border bg-card px-4 py-3 flex items-center gap-2">
      <button
        onClick={onSaveDraft}
        className="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-border hover:bg-accent transition-colors"
      >
        Save Draft
      </button>
      <button
        onClick={onFinalize}
        className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
      >
        {label}
      </button>
      <button className="p-2 rounded-lg border border-border hover:bg-accent transition-colors text-muted-foreground" title="Share">
        <Share2 className="h-3.5 w-3.5" />
      </button>
      <button className="p-2 rounded-lg border border-border hover:bg-accent transition-colors text-muted-foreground" title="Download">
        <Download className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─── Field Row ────────────────────────────────────────────────────────────────

function FieldRow({ label, value, mono, missing }: {
  label: string
  value?: string | number | boolean | null
  mono?: boolean
  missing?: boolean
}) {
  const isEmpty = value === null || value === undefined || value === '' || value === '[MISSING]'
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground w-32 flex-shrink-0 pt-0.5">{label}</span>
      <span className={cn(
        'text-xs flex-1',
        missing || isEmpty ? 'text-amber-600 italic' : mono ? 'font-mono text-foreground' : 'text-foreground'
      )}>
        {isEmpty ? (missing ? `[${label} required]` : '—') : String(value)}
      </span>
    </div>
  )
}

// ─── Logbook Entry Artifact ───────────────────────────────────────────────────

function LogbookEntryArtifact({ data, missingFields, complianceNotes }: {
  data: any
  missingFields?: string[]
  complianceNotes?: string[]
}) {
  const [editingText, setEditingText] = useState(false)
  const [entryText, setEntryText] = useState(data?.entry_text ?? '')

  if (!data) return <div className="p-4 text-sm text-muted-foreground">No data available.</div>

  const statusColor = data.return_to_service ? 'text-green-600 bg-green-50 border-green-200' : 'text-amber-600 bg-amber-50 border-amber-200'

  return (
    <div className="pb-24">
      <MissingFieldsBanner fields={missingFields} />
      <ComplianceNotes notes={complianceNotes} />

      {/* Status badge */}
      <div className="px-4 mt-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 capitalize">
          {(data.entry_type ?? 'maintenance').replace(/_/g, ' ')}
        </span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-muted text-muted-foreground capitalize">
          {data.logbook_type ?? 'airframe'} logbook
        </span>
        {data.return_to_service && (
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', statusColor)}>
            <CheckCircle2 className="inline h-3 w-3 mr-1" />
            Return to Service
          </span>
        )}
      </div>

      {/* Entry text — editable */}
      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Entry Text</p>
          <button
            onClick={() => setEditingText(!editingText)}
            className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600"
          >
            <Pencil className="h-3 w-3" />
            {editingText ? 'Done' : 'Edit'}
          </button>
        </div>
        {editingText ? (
          <textarea
            value={entryText}
            onChange={e => setEntryText(e.target.value)}
            rows={8}
            className="w-full text-sm leading-relaxed p-3 rounded-lg border border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 bg-background resize-none font-mono"
          />
        ) : (
          <div className="p-3 rounded-lg bg-muted/40 border border-border">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {entryText || <span className="text-muted-foreground italic">No entry text generated.</span>}
            </p>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="px-4 mt-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Details</p>
        <div className="rounded-lg border border-border overflow-hidden bg-background">
          <FieldRow label="Date" value={data.entry_date} missing={!data.entry_date} />
          <FieldRow label="Hobbs Time" value={data.hobbs_time != null ? `${data.hobbs_time} hrs` : null} missing={!data.hobbs_time} />
          <FieldRow label="Tach Time" value={data.tach_time != null ? `${data.tach_time} hrs` : null} missing={!data.tach_time} />
          <FieldRow label="Total Time After" value={data.total_time_after != null ? `${data.total_time_after} hrs` : null} />
          <FieldRow label="Mechanic" value={data.mechanic_name} missing={!data.mechanic_name} />
          <FieldRow label="Certificate" value={data.mechanic_certificate} />
          <FieldRow label="Cert Number" value={data.mechanic_cert_number} mono />
        </div>
      </div>

      {/* Parts used */}
      {Array.isArray(data.parts_used) && data.parts_used.length > 0 && (
        <div className="px-4 mt-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Parts Used</p>
          <div className="rounded-lg border border-border overflow-hidden">
            {data.parts_used.map((part: any, i: number) => (
              <div key={i} className="px-3 py-2 border-b border-border last:border-0 text-xs">
                <span className="font-mono text-foreground">{part.part_number ?? '—'}</span>
                {part.description && <span className="text-muted-foreground ml-2">{part.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <ArtifactActions label="Finalize Entry" />
    </div>
  )
}

// ─── Work Order Artifact ──────────────────────────────────────────────────────

function WorkOrderArtifact({ data, missingFields }: { data: any; missingFields?: string[] }) {
  if (!data) return <div className="p-4 text-sm text-muted-foreground">No data available.</div>

  const statusColors: Record<string, string> = {
    draft: 'text-muted-foreground bg-muted border-border',
    open: 'text-blue-700 bg-blue-50 border-blue-200',
    in_progress: 'text-orange-700 bg-orange-50 border-orange-200',
    awaiting_parts: 'text-amber-700 bg-amber-50 border-amber-200',
    ready_for_signoff: 'text-green-700 bg-green-50 border-green-200',
    closed: 'text-muted-foreground bg-muted border-border',
  }
  const statusClass = statusColors[data.status ?? 'draft'] ?? statusColors.draft

  const laborTotal = Array.isArray(data.labor_lines)
    ? data.labor_lines.reduce((s: number, l: any) => s + ((l.hours ?? 0) * (l.rate ?? 0)), 0)
    : 0
  const partsTotal = Array.isArray(data.parts_lines)
    ? data.parts_lines.reduce((s: number, l: any) => s + ((l.quantity ?? 1) * (l.unit_price ?? 0)), 0)
    : 0

  return (
    <div className="pb-24">
      <MissingFieldsBanner fields={missingFields} />

      {/* WO header */}
      <div className="px-4 mt-4 flex items-center gap-3">
        <span className="font-mono text-lg font-bold text-foreground">{data.work_order_number ?? 'WO-DRAFT'}</span>
        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border capitalize', statusClass)}>
          {(data.status ?? 'draft').replace(/_/g, ' ')}
        </span>
      </div>

      {/* Complaint / Discrepancy / Corrective Action */}
      <div className="px-4 mt-4 space-y-3">
        {data.customer_complaint && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Customer Complaint</p>
            <p className="text-sm text-foreground bg-muted/40 rounded-lg border border-border p-3">{data.customer_complaint}</p>
          </div>
        )}
        {data.discrepancy && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Discrepancy</p>
            <p className="text-sm text-foreground bg-muted/40 rounded-lg border border-border p-3">{data.discrepancy}</p>
          </div>
        )}
        {data.corrective_action && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Corrective Action</p>
            <p className="text-sm text-foreground bg-muted/40 rounded-lg border border-border p-3">{data.corrective_action}</p>
          </div>
        )}
      </div>

      {/* Labor lines */}
      {Array.isArray(data.labor_lines) && data.labor_lines.length > 0 && (
        <div className="px-4 mt-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Labor</p>
          <div className="rounded-lg border border-border overflow-hidden">
            {data.labor_lines.map((line: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 text-xs">
                <span className="flex-1 text-foreground">{line.description ?? 'Labor'}</span>
                <span className="text-muted-foreground">{line.hours ?? '?'} hrs</span>
                <span className="font-mono text-foreground">${((line.hours ?? 0) * (line.rate ?? 0)).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 text-xs font-medium">
              <span>Labor Total</span>
              <span className="font-mono">${laborTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Parts lines */}
      {Array.isArray(data.parts_lines) && data.parts_lines.length > 0 && (
        <div className="px-4 mt-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Parts</p>
          <div className="rounded-lg border border-border overflow-hidden">
            {data.parts_lines.map((line: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 text-xs">
                <span className="font-mono text-foreground">{line.part_number ?? '—'}</span>
                <span className="flex-1 text-muted-foreground truncate">{line.description ?? ''}</span>
                <span className="text-muted-foreground">×{line.quantity ?? 1}</span>
                <span className="font-mono text-foreground">${((line.quantity ?? 1) * (line.unit_price ?? 0)).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 text-xs font-medium">
              <span>Parts Total</span>
              <span className="font-mono">${partsTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Subtotal */}
      {(laborTotal + partsTotal) > 0 && (
        <div className="px-4 mt-3">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-foreground/5 border border-border text-sm font-semibold">
            <span>Estimated Total</span>
            <span className="font-mono">${(laborTotal + partsTotal).toFixed(2)}</span>
          </div>
        </div>
      )}

      <ArtifactActions label="Open Work Order" />
    </div>
  )
}

// ─── Invoice Artifact ─────────────────────────────────────────────────────────

function InvoiceArtifact({ data, missingFields }: { data: any; missingFields?: string[] }) {
  if (!data) return <div className="p-4 text-sm text-muted-foreground">No data available.</div>

  const subtotal = data.subtotal ?? 0
  const taxRate = data.tax_rate ?? 0
  const taxAmount = subtotal * taxRate
  const total = subtotal + taxAmount

  return (
    <div className="pb-24">
      <MissingFieldsBanner fields={missingFields} />

      <div className="px-4 mt-4 flex items-center gap-3">
        <span className="font-mono text-lg font-bold text-foreground">{data.invoice_number ?? 'INV-DRAFT'}</span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full border capitalize bg-muted text-muted-foreground border-border">
          {data.status ?? 'draft'}
        </span>
      </div>

      {/* Line items */}
      {Array.isArray(data.line_items) && data.line_items.length > 0 && (
        <div className="px-4 mt-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Line Items</p>
          <div className="rounded-lg border border-border overflow-hidden">
            {data.line_items.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 text-xs">
                <span className="flex-1 text-foreground">{item.description ?? 'Item'}</span>
                <span className="text-muted-foreground">×{item.quantity ?? 1}</span>
                <span className="font-mono text-foreground">${((item.quantity ?? 1) * (item.unit_price ?? 0)).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="px-4 mt-4">
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex justify-between px-3 py-2 border-b border-border text-xs">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono">${subtotal.toFixed(2)}</span>
          </div>
          {taxRate > 0 && (
            <div className="flex justify-between px-3 py-2 border-b border-border text-xs">
              <span className="text-muted-foreground">Tax ({(taxRate * 100).toFixed(1)}%)</span>
              <span className="font-mono">${taxAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between px-3 py-2.5 bg-foreground/5 text-sm font-semibold">
            <span>Total</span>
            <span className="font-mono">${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {data.due_date && (
        <div className="px-4 mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Due {data.due_date}
        </div>
      )}

      {data.notes && (
        <div className="px-4 mt-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg border border-border p-3">{data.notes}</p>
        </div>
      )}

      <ArtifactActions label="Send Invoice" />
    </div>
  )
}

// ─── Parts Search Artifact ────────────────────────────────────────────────────

const confidenceConfig = {
  confirmed: { label: 'Confirmed fit', color: 'text-green-700 bg-green-50 border-green-200' },
  likely: { label: 'Likely fit', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  possible: { label: 'Possible fit', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  unknown: { label: 'Unknown fit', color: 'text-muted-foreground bg-muted border-border' },
}

function PartsSearchArtifact({ data }: { data: any }) {
  if (!data) return <div className="p-4 text-sm text-muted-foreground">No data available.</div>

  const results: any[] = data.results ?? []

  return (
    <div className="pb-6">
      <div className="px-4 mt-4">
        <p className="text-xs text-muted-foreground mb-1">Search query</p>
        <p className="text-sm font-medium text-foreground">{data.query ?? '—'}</p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {results.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">No parts found.</div>
        )}
        {results.map((part: any, i: number) => {
          const conf = confidenceConfig[part.fit_confidence as keyof typeof confidenceConfig] ?? confidenceConfig.unknown
          return (
            <div key={i} className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2.5 flex items-start justify-between gap-3 bg-card">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-foreground">{part.part_number ?? '—'}</span>
                    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full border', conf.color)}>
                      {conf.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{part.description ?? ''}</p>
                  {part.manufacturer && (
                    <p className="text-xs text-muted-foreground">{part.manufacturer}</p>
                  )}
                </div>
                {part.price_estimate && (
                  <span className="font-mono text-sm font-semibold text-foreground flex-shrink-0">
                    ${part.price_estimate}
                  </span>
                )}
              </div>
              <div className="px-3 py-2 border-t border-border flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {part.condition && (
                    <span className="capitalize">{part.condition}</span>
                  )}
                  {part.notes && <span className="text-muted-foreground/70">· {part.notes}</span>}
                </div>
                <button className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                  Add to work order →
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Customer Card Artifact ───────────────────────────────────────────────────

function CustomerCardArtifact({ data }: { data: any }) {
  if (!data) return <div className="p-4 text-sm text-muted-foreground">No data available.</div>

  return (
    <div className="pb-24">
      <div className="px-4 mt-4">
        <h2 className="text-lg font-semibold text-foreground">{data.name ?? 'Customer'}</h2>
        {data.company && <p className="text-sm text-muted-foreground">{data.company}</p>}
      </div>
      <div className="px-4 mt-4">
        <div className="rounded-lg border border-border overflow-hidden bg-background">
          <FieldRow label="Email" value={data.email} />
          <FieldRow label="Phone" value={data.phone} />
          <FieldRow label="Billing Address" value={data.billing_address} />
          <FieldRow label="Preferred Contact" value={data.preferred_contact} />
          {data.notes && <FieldRow label="Notes" value={data.notes} />}
        </div>
      </div>
      <ArtifactActions label="Save Customer" />
    </div>
  )
}
