// data-tour attributes on key elements correspond to product tour targets:
// data-tour="demo-thread-list"   — left panel thread list
// data-tour="demo-aircraft-bar"  — aircraft context bar
// data-tour="demo-chat-input"    — chat input field
// data-tour="demo-artifact-panel"— right artifact panel
// data-tour="demo-suggestion-chips" — quick-try suggestion chips

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Pin,
  Plane,
  MessageSquare,
  FileText,
  Wrench,
  Search,
  Send,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Package,
  ExternalLink,
  Download,
  Mail,
  CreditCard,
  PenLine,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_AIRCRAFT = [
  {
    id: 'demo-1',
    tail_number: 'N7284K',
    make: 'Cessna',
    model: '172S Skyhawk SP',
    year: 2018,
    total_time: 1243.5,
    owner: 'Horizon Flights',
  },
  {
    id: 'demo-2',
    tail_number: 'N4419P',
    make: 'Piper',
    model: 'PA-28-181 Archer III',
    year: 2019,
    total_time: 876.2,
    owner: 'Horizon Flights',
  },
]

const DEMO_THREADS = [
  { id: 't1', title: 'Annual Inspection — N7284K', aircraft_id: 'demo-1', pinned: true },
  { id: 't2', title: 'Work Order: Oil Change', aircraft_id: 'demo-1', pinned: false },
  { id: 't3', title: 'Invoice Generation', aircraft_id: 'demo-2', pinned: false },
  { id: 't4', title: 'Parts: Alternator Lookup', aircraft_id: 'demo-1', pinned: false },
  { id: 't5', title: 'Logbook Entry Draft', aircraft_id: 'demo-1', pinned: false },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ArtifactType = 'logbook_entry' | 'work_order' | 'invoice' | 'parts_search' | null

interface LogbookArtifact {
  type: 'logbook_entry'
  aircraft: string
  date: string
  total_time: string
  entry_text: string
  status: string
  missing_fields: string[]
}

interface WorkOrderArtifact {
  type: 'work_order'
  wo_number: string
  aircraft: string
  customer: string
  date: string
  status: string
  complaint: string
  labor_lines: { description: string; hours: number; rate: number }[]
  parts_lines: { part_number: string; description: string; price: number }[]
}

interface InvoiceArtifact {
  type: 'invoice'
  invoice_number: string
  customer: string
  aircraft: string
  labor_subtotal: number
  parts_subtotal: number
  tax: number
  total: number
  status: string
  due_date: string
}

interface PartsResultItem {
  part_number: string
  description: string
  condition: string
  price: number
  vendor: string
  fit_confidence: string
  in_stock: boolean
}

interface PartsSearchArtifact {
  type: 'parts_search'
  query: string
  aircraft: string
  results: PartsResultItem[]
}

type ArtifactData = LogbookArtifact | WorkOrderArtifact | InvoiceArtifact | PartsSearchArtifact | null

interface DemoResponse {
  message: string
  artifact: ArtifactType
  artifactData: ArtifactData
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  artifact?: ArtifactType
  artifactData?: ArtifactData
}

// ---------------------------------------------------------------------------
// Scripted responses
// ---------------------------------------------------------------------------

const today = new Date().toLocaleDateString()
const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()

const DEMO_RESPONSES: Record<string, DemoResponse> = {
  logbook: {
    message: `I've drafted a logbook entry for N7284K based on the current work context. The aircraft has 1,243.5 hours total time.\n\nI've pre-filled everything I know. I need a few items to complete the entry:\n\n• **Tach time at completion** — what was the tach reading?\n• **Certificate number** — your A&P/IA cert number for the signoff block\n• **Parts used** — any parts replaced during this work?\n\nThe draft is ready in the panel on the right. You can edit any field directly.`,
    artifact: 'logbook_entry',
    artifactData: {
      type: 'logbook_entry',
      aircraft: 'N7284K — Cessna 172S Skyhawk SP',
      date: today,
      total_time: '1,243.5',
      entry_text:
        'Performed 100-hour inspection in accordance with Cessna 172S Maintenance Manual and FAA-approved Aircraft Inspection Program. Inspected airframe, engine, propeller, and all systems IAW applicable maintenance manuals. Found and corrected discrepancies noted in attached squawk sheet. Aircraft returned to service this date.',
      status: 'draft',
      missing_fields: ['tach_time', 'certificate_number'],
    },
  },
  'work order': {
    message: `Work order created for N7284K. I've assigned WO-01024 and auto-filled aircraft details, today's date, and your mechanic info.\n\nWhat's the customer complaint / squawk?`,
    artifact: 'work_order',
    artifactData: {
      type: 'work_order',
      wo_number: 'WO-01024',
      aircraft: 'N7284K — Cessna 172S',
      customer: 'Horizon Flights',
      date: today,
      status: 'Open',
      complaint: '',
      labor_lines: [],
      parts_lines: [],
    },
  },
  invoice: {
    message: `Invoice INV-02031 generated from work order WO-01024 for Horizon Flights.\n\nLabor: $340.00 (4.0 hrs @ $85/hr)\nParts: $127.50\nTotal: **$467.50**\n\nDue in 30 days. I can email this to the customer, share a secure link, or download as PDF.`,
    artifact: 'invoice',
    artifactData: {
      type: 'invoice',
      invoice_number: 'INV-02031',
      customer: 'Horizon Flights',
      aircraft: 'N7284K',
      labor_subtotal: 340.0,
      parts_subtotal: 127.5,
      tax: 0,
      total: 467.5,
      status: 'pending',
      due_date: thirtyDaysOut,
    },
  },
  alternator: {
    message: `Found 3 alternator options for N7284K (Cessna 172S / Lycoming IO-360):\n\n1. **Plane-Power AL12-C70** — Remanufactured, Fit confidence: High ✓\n2. **Kelly Aerospace 50-125** — Overhauled, Fit confidence: High ✓\n3. **Plane-Power AL12-C70 New** — New manufacture, Fit confidence: High ✓\n\nPrices and availability shown in the panel. Want me to add the Plane-Power unit to the work order?`,
    artifact: 'parts_search',
    artifactData: {
      type: 'parts_search',
      query: 'alternator Cessna 172S Lycoming IO-360',
      aircraft: 'N7284K',
      results: [
        {
          part_number: 'AL12-C70',
          description: 'Alternator, 60A, Plane-Power Remanufactured',
          condition: 'Remanufactured',
          price: 425.0,
          vendor: 'Aircraft Spruce',
          fit_confidence: 'high',
          in_stock: true,
        },
        {
          part_number: '50-125',
          description: 'Alternator, Kelly Aerospace Overhauled',
          condition: 'Overhauled',
          price: 385.0,
          vendor: 'Chief Aircraft',
          fit_confidence: 'high',
          in_stock: true,
        },
        {
          part_number: 'AL12-C70-NEW',
          description: 'Alternator, 60A, Plane-Power New',
          condition: 'New',
          price: 695.0,
          vendor: 'Plane-Power Direct',
          fit_confidence: 'high',
          in_stock: false,
        },
      ],
    },
  },
  annual: {
    message: `Pulling up the annual inspection record for N7284K...\n\n**Last Annual:** March 14, 2024 — 1,198.5 TT\nPerformed at: Skyline Aviation Services\nInspecting IA: J. Williams, IA #3274891\n\n**Next Annual Due:** March 14, 2025 (or 1,298.5 TT, whichever first)\n\nStatus: ✅ Current — 312 days / 45 hours remaining\n\nWould you like me to generate the renewal entry now, or view the full compliance record?`,
    artifact: null,
    artifactData: null,
  },
  default: {
    message: `I'm ready to help with N7284K. Here are some things you can try:\n\n• **"prepare a logbook entry"** — I'll draft a compliant maintenance entry\n• **"generate a work order"** — Creates WO with aircraft/customer pre-filled\n• **"find alternator for this aircraft"** — Parts lookup with fit confidence\n• **"generate invoice"** — Invoice from work order\n• **"show last annual"** — Pull inspection history\n\nThis is a live demo — everything you see here is how the real platform works.`,
    artifact: null,
    artifactData: null,
  },
}

function matchResponse(input: string): DemoResponse {
  const lower = input.toLowerCase()
  if (lower.includes('logbook') || lower.includes('log book') || lower.includes('maintenance entry')) {
    return DEMO_RESPONSES.logbook
  }
  if (lower.includes('work order') || lower.includes('workorder')) {
    return DEMO_RESPONSES['work order']
  }
  if (lower.includes('invoice') || lower.includes('bill')) {
    return DEMO_RESPONSES.invoice
  }
  if (lower.includes('alternator') || lower.includes('parts') || lower.includes('part lookup')) {
    return DEMO_RESPONSES.alternator
  }
  if (lower.includes('annual') || lower.includes('inspection')) {
    return DEMO_RESPONSES.annual
  }
  return DEMO_RESPONSES.default
}

// ---------------------------------------------------------------------------
// Thread icon helper
// ---------------------------------------------------------------------------

function threadIcon(title: string) {
  const lower = title.toLowerCase()
  if (lower.includes('invoice')) return <DollarSign className="w-3.5 h-3.5" />
  if (lower.includes('work order') || lower.includes('oil')) return <Wrench className="w-3.5 h-3.5" />
  if (lower.includes('parts') || lower.includes('alternator')) return <Package className="w-3.5 h-3.5" />
  if (lower.includes('logbook')) return <FileText className="w-3.5 h-3.5" />
  if (lower.includes('annual') || lower.includes('inspection')) return <CheckCircle2 className="w-3.5 h-3.5" />
  return <MessageSquare className="w-3.5 h-3.5" />
}

// ---------------------------------------------------------------------------
// Markdown-light renderer (bold only, newlines)
// ---------------------------------------------------------------------------

function renderMarkdown(text: string) {
  const lines = text.split('\n')
  return lines.map((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/)
    return (
      <span key={li}>
        {parts.map((part, pi) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={pi}>{part.slice(2, -2)}</strong>
          }
          return <span key={pi}>{part}</span>
        })}
        {li < lines.length - 1 && <br />}
      </span>
    )
  })
}

// ---------------------------------------------------------------------------
// Artifact panel sub-components
// ---------------------------------------------------------------------------

function LogbookArtifactView({ data }: { data: LogbookArtifact }) {
  const [entryText, setEntryText] = useState(data.entry_text)
  const missingLabels: Record<string, string> = {
    tach_time: 'Tach Time at Completion',
    certificate_number: 'A&P / IA Certificate Number',
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Logbook Entry Draft</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
          <Clock className="w-3 h-3" /> Draft
        </span>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm">
        <div className="flex justify-between text-xs text-slate-500">
          <span>{data.aircraft}</span>
          <span>{data.date}</span>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Total Time</span>
          <span className="font-mono font-semibold text-slate-700">{data.total_time} hrs</span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Entry Text</label>
        <textarea
          className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={6}
          value={entryText}
          onChange={(e) => setEntryText(e.target.value)}
        />
      </div>

      {data.missing_fields.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-amber-700 text-xs font-semibold">
            <AlertCircle className="w-3.5 h-3.5" /> Required before finalizing
          </div>
          {data.missing_fields.map((f) => (
            <div key={f}>
              <label className="block text-xs text-amber-600 mb-0.5">{missingLabels[f] ?? f}</label>
              <input
                className="w-full rounded border border-amber-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder={`Enter ${missingLabels[f] ?? f}...`}
              />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Compliance Checklist</div>
        {[
          '14 CFR §43.9 — Description of work performed',
          '14 CFR §43.9 — Date of completion',
          '14 CFR §43.9 — Signature and certificate number',
          'Aircraft returned to airworthy condition',
        ].map((item) => (
          <div key={item} className="flex items-start gap-2 text-xs text-slate-600">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
            <span>{item}</span>
          </div>
        ))}
        {data.missing_fields.map((f) => (
          <div key={f} className="flex items-start gap-2 text-xs text-amber-600">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{missingLabels[f] ?? f} — required</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 transition-colors">
          <PenLine className="w-3.5 h-3.5" /> Sign &amp; Finalize
        </button>
        <button className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50 transition-colors">
          <Download className="w-3.5 h-3.5" /> PDF
        </button>
      </div>
    </div>
  )
}

function WorkOrderArtifactView({ data }: { data: WorkOrderArtifact }) {
  const [complaint, setComplaint] = useState(data.complaint)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Work Order</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
          {data.status}
        </span>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500 text-xs">WO Number</span>
          <span className="font-mono font-semibold text-slate-800">{data.wo_number}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 text-xs">Aircraft</span>
          <span className="text-slate-700 text-xs">{data.aircraft}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 text-xs">Customer</span>
          <span className="text-slate-700 text-xs">{data.customer}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 text-xs">Date</span>
          <span className="text-slate-700 text-xs">{data.date}</span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Customer Complaint / Squawk</label>
        <textarea
          className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          placeholder="Describe the customer's reported issue..."
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-slate-600">Labor Lines</span>
          <button className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-2.5 py-1.5 text-slate-500 font-medium">Description</th>
                <th className="text-right px-2.5 py-1.5 text-slate-500 font-medium">Hrs</th>
                <th className="text-right px-2.5 py-1.5 text-slate-500 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="text-slate-400 italic">
                <td className="px-2.5 py-2" colSpan={3}>
                  No labor lines added yet
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-slate-600">Parts Lines</span>
          <button className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-2.5 py-1.5 text-slate-500 font-medium">Part #</th>
                <th className="text-left px-2.5 py-1.5 text-slate-500 font-medium">Description</th>
                <th className="text-right px-2.5 py-1.5 text-slate-500 font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              <tr className="text-slate-400 italic">
                <td className="px-2.5 py-2" colSpan={3}>
                  No parts added yet
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 transition-colors">
          <DollarSign className="w-3.5 h-3.5" /> Generate Invoice
        </button>
        <button className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium py-2 hover:bg-slate-50 transition-colors">
          <FileText className="w-3.5 h-3.5" /> Logbook Entry
        </button>
      </div>
    </div>
  )
}

function InvoiceArtifactView({ data }: { data: InvoiceArtifact }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Invoice</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">
          <Clock className="w-3 h-3" /> Pending
        </span>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500 text-xs">Invoice #</span>
          <span className="font-mono font-semibold text-slate-800">{data.invoice_number}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 text-xs">Customer</span>
          <span className="text-slate-700 text-xs">{data.customer}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 text-xs">Aircraft</span>
          <span className="text-slate-700 text-xs">{data.aircraft}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 text-xs">Due Date</span>
          <span className="text-slate-700 text-xs">{data.due_date}</span>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-3 py-2 text-slate-600 text-xs">Labor</td>
              <td className="px-3 py-2 text-right text-slate-800 font-medium text-xs">
                ${data.labor_subtotal.toFixed(2)}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-slate-600 text-xs">Parts</td>
              <td className="px-3 py-2 text-right text-slate-800 font-medium text-xs">
                ${data.parts_subtotal.toFixed(2)}
              </td>
            </tr>
            {data.tax > 0 && (
              <tr>
                <td className="px-3 py-2 text-slate-600 text-xs">Tax</td>
                <td className="px-3 py-2 text-right text-slate-800 font-medium text-xs">${data.tax.toFixed(2)}</td>
              </tr>
            )}
            <tr className="bg-slate-50">
              <td className="px-3 py-2.5 text-slate-800 font-semibold text-sm">Total</td>
              <td className="px-3 py-2.5 text-right text-blue-700 font-bold text-sm">${data.total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <button className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 transition-colors">
          <Mail className="w-3.5 h-3.5" /> Email Customer
        </button>
        <div className="flex gap-2">
          <button className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium py-2 hover:bg-slate-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
          <button className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm font-medium py-2 hover:bg-green-100 transition-colors">
            <CreditCard className="w-3.5 h-3.5" /> Mark Paid
          </button>
        </div>
      </div>
    </div>
  )
}

function conditionBadge(condition: string) {
  const lower = condition.toLowerCase()
  if (lower === 'new') return 'bg-green-100 text-green-700'
  if (lower === 'overhauled') return 'bg-blue-100 text-blue-700'
  return 'bg-slate-100 text-slate-600'
}

function PartsSearchArtifactView({ data }: { data: PartsSearchArtifact }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Parts Search</span>
        <span className="text-xs text-slate-500">{data.results.length} results</span>
      </div>
      <div className="text-xs text-slate-500 bg-slate-50 rounded px-2.5 py-1.5 font-mono">{data.query}</div>

      <div className="space-y-3">
        {data.results.map((result) => (
          <div
            key={result.part_number}
            className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 hover:border-blue-200 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-slate-500">{result.part_number}</div>
                <div className="text-sm font-medium text-slate-800 leading-snug mt-0.5">{result.description}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-base font-bold text-slate-800">${result.price.toFixed(2)}</div>
                <div className="text-xs text-slate-400">{result.vendor}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', conditionBadge(result.condition))}>
                {result.condition}
              </span>
              {result.fit_confidence === 'high' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                  High Fit ✓
                </span>
              )}
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  result.in_stock ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                )}
              >
                {result.in_stock ? 'In Stock' : 'Out of Stock'}
              </span>
            </div>
            <button className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium py-1.5 hover:bg-blue-100 transition-colors">
              <Plus className="w-3 h-3" /> Add to Work Order
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyArtifactPanel() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
        <FileText className="w-6 h-6 text-slate-400" />
      </div>
      <div>
        <div className="text-sm font-medium text-slate-600">Documents &amp; Artifacts</div>
        <div className="text-xs text-slate-400 mt-1 leading-relaxed">
          Generated logbook entries, work orders, invoices, and parts results appear here as you chat.
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main DemoShell
// ---------------------------------------------------------------------------

export function DemoShell() {
  const [activeThreadId, setActiveThreadId] = useState('t1')
  const [selectedAircraftId, setSelectedAircraftId] = useState('demo-1')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Welcome to the MyAircraft.us demo. I'm connected to N7284K — Cessna 172S Skyhawk SP, 1,243.5 hours total time.\n\nTry asking me to prepare a logbook entry, generate a work order, look up parts, or pull the annual inspection record.`,
      artifact: null,
      artifactData: null,
    },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [currentArtifact, setCurrentArtifact] = useState<ArtifactType>(null)
  const [currentArtifactData, setCurrentArtifactData] = useState<ArtifactData>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedAircraft = DEMO_AIRCRAFT.find((a) => a.id === selectedAircraftId) ?? DEMO_AIRCRAFT[0]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const streamMessage = useCallback(
    (fullText: string, artifact: ArtifactType, artifactData: ArtifactData) => {
      const msgId = `ai-${Date.now()}`
      setMessages((prev) => [...prev, { id: msgId, role: 'assistant', content: '', artifact, artifactData }])
      setIsTyping(true)

      let idx = 0
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current)

      typingIntervalRef.current = setInterval(() => {
        idx += 2 // advance 2 chars per tick for snappier feel
        const chunk = fullText.slice(0, idx)
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, content: chunk } : m))
        )
        if (idx >= fullText.length) {
          clearInterval(typingIntervalRef.current!)
          typingIntervalRef.current = null
          setIsTyping(false)
          setCurrentArtifact(artifact)
          setCurrentArtifactData(artifactData)
        }
      }, 15)
    },
    []
  )

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isTyping) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      artifact: null,
      artifactData: null,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')

    const response = matchResponse(trimmed)
    setTimeout(() => {
      streamMessage(response.message, response.artifact, response.artifactData)
    }, 300)
  }, [input, isTyping, streamMessage])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleThreadClick = (thread: (typeof DEMO_THREADS)[0]) => {
    setActiveThreadId(thread.id)
    setSelectedAircraftId(thread.aircraft_id)
    const aircraft = DEMO_AIRCRAFT.find((a) => a.id === thread.aircraft_id)
    if (!aircraft) return

    setMessages([
      {
        id: `thread-${thread.id}-welcome`,
        role: 'assistant',
        content: `Switched to "${thread.title}" — ${aircraft.tail_number} (${aircraft.make} ${aircraft.model}, ${aircraft.total_time} TT).\n\nWhat would you like to do with this thread?`,
        artifact: null,
        artifactData: null,
      },
    ])
    setCurrentArtifact(null)
    setCurrentArtifactData(null)
  }

  const SUGGESTION_CHIPS = [
    'prepare a logbook entry',
    'generate a work order',
    'find alternator',
    'show last annual',
  ]

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* Demo Banner */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0f172a] text-white text-sm shrink-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-base">🎯</span>
          <span className="font-medium">Demo Mode</span>
          <span className="text-slate-300 hidden sm:inline">— No login needed. This is a live preview of MyAircraft.us.</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/signup"
            className="px-3 py-1 rounded-md bg-blue-500 hover:bg-blue-400 text-white text-xs font-semibold transition-colors"
          >
            Sign Up Free →
          </Link>
          <Link
            href="/#pricing"
            className="px-3 py-1 rounded-md border border-slate-600 hover:border-slate-400 text-slate-200 text-xs font-medium transition-colors"
          >
            See Pricing →
          </Link>
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT: Thread list */}
        <div
          className="w-[280px] shrink-0 flex flex-col bg-[#0f172a] border-r border-slate-800"
          data-tour="demo-thread-list"
        >
          {/* Logo / brand */}
          <div className="px-4 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center">
                <Plane className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-semibold text-sm">myaircraft.us</span>
            </div>
          </div>

          {/* Aircraft switcher */}
          <div className="px-3 py-3 border-b border-slate-800 space-y-1">
            {DEMO_AIRCRAFT.map((ac) => (
              <button
                key={ac.id}
                onClick={() => setSelectedAircraftId(ac.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors',
                  selectedAircraftId === ac.id
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                )}
              >
                <Plane className="w-3.5 h-3.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{ac.tail_number}</div>
                  <div className="text-[10px] text-slate-400 truncate">{ac.model}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto py-2">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Threads
            </div>
            {DEMO_THREADS.map((thread) => {
              const aircraft = DEMO_AIRCRAFT.find((a) => a.id === thread.aircraft_id)
              return (
                <button
                  key={thread.id}
                  onClick={() => handleThreadClick(thread)}
                  className={cn(
                    'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors group',
                    activeThreadId === thread.id
                      ? 'bg-slate-700/70 text-white'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  )}
                >
                  <span className="mt-0.5 shrink-0 text-slate-400 group-hover:text-slate-300">
                    {threadIcon(thread.title)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {thread.pinned && <Pin className="w-2.5 h-2.5 text-blue-400 shrink-0" />}
                      <span className="text-xs font-medium truncate">{thread.title}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{aircraft?.tail_number}</div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Bottom CTA */}
          <div className="p-3 border-t border-slate-800">
            <Link
              href="/signup"
              className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
            >
              Get Started Free <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* CENTER: Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Aircraft context bar */}
          <div
            className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white shrink-0"
            data-tour="demo-aircraft-bar"
          >
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
              <Plane className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800">
                {selectedAircraft.tail_number}
                <span className="font-normal text-slate-400 ml-1.5 text-xs">
                  {selectedAircraft.make} {selectedAircraft.model} · {selectedAircraft.year}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                {selectedAircraft.total_time.toLocaleString()} TT · {selectedAircraft.owner}
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Demo Mode
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50/40">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mr-2.5 mt-0.5">
                    <Plane className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm'
                  )}
                >
                  {renderMarkdown(msg.content)}
                  {msg.artifactData && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-500 bg-blue-50 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-blue-100 transition-colors">
                      <FileText className="w-3 h-3" />
                      <span className="font-medium capitalize">{msg.artifactData.type.replace(/_/g, ' ')} generated</span>
                      <ChevronRight className="w-3 h-3 ml-auto" />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mr-2.5 mt-0.5">
                  <Plane className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion chips */}
          <div
            className="px-4 pt-2 pb-1 flex flex-wrap gap-1.5 border-t border-slate-100 bg-white"
            data-tour="demo-suggestion-chips"
          >
            {SUGGESTION_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => {
                  setInput(chip)
                  inputRef.current?.focus()
                }}
                className="px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 text-xs text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="px-4 pb-4 pt-2 bg-white" data-tour="demo-chat-input">
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent shadow-sm transition-shadow">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Demo mode — try: 'prepare a logbook entry'"
                className="flex-1 resize-none text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none bg-transparent max-h-28 leading-relaxed"
                style={{ height: 'auto', minHeight: '24px' }}
                onInput={(e) => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = `${el.scrollHeight}px`
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0',
                  input.trim() && !isTyping
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                )}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5 px-1">
              <span className="text-[10px] text-slate-400">Shift+Enter for new line</span>
              <Link href="/signup" className="text-[10px] text-blue-500 hover:text-blue-600 flex items-center gap-0.5">
                Get the real platform <ExternalLink className="w-2.5 h-2.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* RIGHT: Artifact panel */}
        <div
          className="w-[380px] shrink-0 flex flex-col border-l border-slate-200 bg-white"
          data-tour="demo-artifact-panel"
        >
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
            <span className="text-sm font-semibold text-slate-700">Artifact Panel</span>
            {currentArtifact && (
              <span className="text-xs text-slate-400 capitalize">{currentArtifact.replace(/_/g, ' ')}</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {!currentArtifactData && <EmptyArtifactPanel />}
            {currentArtifactData?.type === 'logbook_entry' && (
              <LogbookArtifactView data={currentArtifactData as LogbookArtifact} />
            )}
            {currentArtifactData?.type === 'work_order' && (
              <WorkOrderArtifactView data={currentArtifactData as WorkOrderArtifact} />
            )}
            {currentArtifactData?.type === 'invoice' && (
              <InvoiceArtifactView data={currentArtifactData as InvoiceArtifact} />
            )}
            {currentArtifactData?.type === 'parts_search' && (
              <PartsSearchArtifactView data={currentArtifactData as PartsSearchArtifact} />
            )}
          </div>

          {/* Bottom signup nudge */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/80 shrink-0">
            <div className="text-xs text-slate-500 mb-2 leading-relaxed">
              In the real platform, artifacts auto-save, sync to your records, and are legally compliant.
            </div>
            <Link
              href="/signup"
              className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
            >
              Start Free Trial <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
