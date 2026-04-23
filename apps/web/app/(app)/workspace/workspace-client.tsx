'use client'

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from 'react'
import {
  MessageSquare,
  Wrench,
  FileText,
  DollarSign,
  Search,
  Plus,
  Pin,
  Archive,
  Plane,
  Send,
  Loader2,
  ChevronDown,
  X,
  Bot,
  ClipboardList,
  Package,
  ShieldCheck,
  History,
  Edit3,
  Trash2,
  MoreHorizontal,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Download,
  Share2,
  Mail,
  Star,
  Filter,
  PlusCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Aircraft } from '@/types'
import { useSearchParams } from 'next/navigation'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { useAppContext } from '@/components/redesign/AppContext'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ArtifactType =
  | 'logbook_entry'
  | 'work_order'
  | 'invoice'
  | 'parts_search'
  | null

interface LogbookEntryData {
  entry_date?: string
  entry_type?: string
  hobbs_in?: number
  hobbs_out?: number
  tach_time?: number
  description?: string
  mechanic_name?: string
  mechanic_cert?: string
  ad_reference?: string
  sb_reference?: string
  parts_used?: Array<{ part_number: string; description: string; qty: number }>
  references?: string[]
  status?: 'draft' | 'final' | 'signed'
}

interface WorkOrderData {
  wo_number?: string
  status?: 'open' | 'in_progress' | 'pending_parts' | 'complete' | 'invoiced'
  complaint?: string
  discrepancy?: string
  findings?: string
  corrective_action?: string
  labor_lines?: Array<{ description: string; hours: number; rate: number }>
  parts_lines?: Array<{
    part_number: string
    description: string
    qty: number
    unit_price: number
  }>
  notes?: string
}

interface InvoiceData {
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  customer_name?: string
  customer_address?: string
  customer_email?: string
  line_items?: Array<{ description: string; qty: number; unit_price: number }>
  tax_rate?: number
  status?: 'draft' | 'sent' | 'paid' | 'overdue'
  notes?: string
}

interface PartsResult {
  part_number: string
  description: string
  fit_confidence: 'high' | 'medium' | 'low'
  source: string
  price?: number
  availability?: string
}

interface PartsSearchData {
  query?: string
  results?: PartsResult[]
}

interface ActiveArtifact {
  type: ArtifactType
  data: LogbookEntryData | WorkOrderData | InvoiceData | PartsSearchData
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  intent?: string
  artifactType?: ArtifactType
  artifactData?: ActiveArtifact['data']
  timestamp: Date
}

interface Thread {
  id: string
  title: string
  aircraft_id: string | null
  is_pinned: boolean
  created_at: string
  updated_at: string
}

interface WorkspaceClientProps {
  organizationId: string
  userId: string
  aircraft: Aircraft[]
  initialThreads: Thread[]
  initialAircraftId?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function threadGroup(dateStr: string): 'today' | 'yesterday' | 'earlier' {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / 86400000
  )
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  return 'earlier'
}

const OWNER_SELECTED_AIRCRAFT_STORAGE_KEY = 'owner_selected_aircraft_id'

const OWNER_SUGGESTED_PROMPTS = [
  { label: 'What needs my attention for this aircraft?', icon: AlertTriangle, intent: 'query' },
  { label: 'Show maintenance history', icon: History, intent: 'query' },
  { label: 'Check AD compliance', icon: ShieldCheck, intent: 'query' },
  { label: 'Summarize recent documents', icon: FileText, intent: 'query' },
]

const MECHANIC_SUGGESTED_PROMPTS = [
  { label: 'Prepare a logbook entry', icon: FileText, intent: 'logbook_entry' },
  { label: 'Generate a work order', icon: Wrench, intent: 'work_order' },
  { label: 'Create an invoice', icon: DollarSign, intent: 'invoice' },
  { label: 'Find a part for this aircraft', icon: Search, intent: 'parts_lookup' },
  { label: 'Check AD compliance', icon: ShieldCheck, intent: 'query' },
  { label: 'Show maintenance history', icon: History, intent: 'query' },
]

function buildThreadTitle(content: string) {
  const compact = content.trim().replace(/\s+/g, ' ')
  if (compact.length <= 60) return compact
  return `${compact.slice(0, 57).trimEnd()}...`
}

// ─────────────────────────────────────────────────────────────────────────────
// Artifact placeholder builders
// ─────────────────────────────────────────────────────────────────────────────

function makeLogbookPlaceholder(): LogbookEntryData {
  return {
    entry_date: new Date().toISOString().split('T')[0],
    entry_type: 'maintenance',
    hobbs_in: undefined,
    hobbs_out: undefined,
    tach_time: undefined,
    description: '',
    mechanic_name: '',
    mechanic_cert: '',
    parts_used: [],
    references: [],
    status: 'draft',
  }
}

function makeWorkOrderPlaceholder(): WorkOrderData {
  return {
    wo_number: `WO-${Date.now().toString().slice(-6)}`,
    status: 'open',
    complaint: '',
    discrepancy: '',
    findings: '',
    corrective_action: '',
    labor_lines: [{ description: 'Inspection labor', hours: 1, rate: 85 }],
    parts_lines: [],
    notes: '',
  }
}

function makeInvoicePlaceholder(): InvoiceData {
  const today = new Date()
  const due = new Date(today)
  due.setDate(due.getDate() + 30)
  return {
    invoice_number: `INV-${Date.now().toString().slice(-6)}`,
    invoice_date: today.toISOString().split('T')[0],
    due_date: due.toISOString().split('T')[0],
    customer_name: '',
    customer_address: '',
    customer_email: '',
    line_items: [],
    tax_rate: 0,
    status: 'draft',
    notes: '',
  }
}

function makePartsPlaceholder(query: string): PartsSearchData {
  return {
    query,
    results: [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components: Artifact Panels
// ─────────────────────────────────────────────────────────────────────────────

function LogbookEntryArtifact({
  data,
  onChange,
}: {
  data: LogbookEntryData
  onChange: (d: LogbookEntryData) => void
}) {
  const entryTypes = [
    'annual_inspection',
    'progressive_inspection',
    '100hr_inspection',
    'ad_compliance',
    'maintenance',
    'repair',
    'alteration',
    'return_to_service',
    'other',
  ]

  const isAutoPopulated = (field: keyof LogbookEntryData) =>
    data[field] !== undefined && data[field] !== '' && data[field] !== null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <FileText className="h-4 w-4 text-brand-600" />
        <span className="font-semibold text-sm text-foreground">Logbook Entry</span>
        <Badge variant="outline" className="text-xs">
          {data.entry_type ?? 'maintenance'}
        </Badge>
        <Badge
          className={cn(
            'text-xs ml-auto',
            data.status === 'signed'
              ? 'bg-green-100 text-green-800 border-green-200'
              : data.status === 'final'
              ? 'bg-blue-100 text-blue-800 border-blue-200'
              : 'bg-amber-100 text-amber-800 border-amber-200'
          )}
          variant="outline"
        >
          {data.status ?? 'draft'}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Date + Entry Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Entry Date <span className="text-red-500">*</span>
              </label>
              <div className={cn('rounded-md', isAutoPopulated('entry_date') && 'ring-2 ring-blue-200')}>
                <Input
                  type="date"
                  value={data.entry_date ?? ''}
                  onChange={(e) => onChange({ ...data, entry_date: e.target.value })}
                  className={cn('text-sm', isAutoPopulated('entry_date') && 'bg-blue-50')}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Entry Type <span className="text-red-500">*</span>
              </label>
              <Select
                value={data.entry_type ?? ''}
                onValueChange={(v) => onChange({ ...data, entry_type: v })}
              >
                <SelectTrigger className={cn('text-sm', isAutoPopulated('entry_type') && 'bg-blue-50')}>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {entryTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Hobbs / Tach */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Hobbs In</label>
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={data.hobbs_in ?? ''}
                onChange={(e) => onChange({ ...data, hobbs_in: parseFloat(e.target.value) || undefined })}
                className={cn('text-sm', isAutoPopulated('hobbs_in') && 'bg-blue-50')}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Hobbs Out</label>
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={data.hobbs_out ?? ''}
                onChange={(e) => onChange({ ...data, hobbs_out: parseFloat(e.target.value) || undefined })}
                className={cn('text-sm', isAutoPopulated('hobbs_out') && 'bg-blue-50')}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tach Time</label>
              <Input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={data.tach_time ?? ''}
                onChange={(e) => onChange({ ...data, tach_time: parseFloat(e.target.value) || undefined })}
                className={cn('text-sm', isAutoPopulated('tach_time') && 'bg-blue-50')}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">
                Work Performed <span className="text-red-500">*</span>
              </label>
              {!data.description && (
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                  Required
                </Badge>
              )}
            </div>
            <Textarea
              rows={5}
              placeholder="Describe the work performed in detail…"
              value={data.description ?? ''}
              onChange={(e) => onChange({ ...data, description: e.target.value })}
              className={cn(
                'text-sm resize-none',
                isAutoPopulated('description') ? 'bg-blue-50' : !data.description ? 'border-amber-300' : ''
              )}
            />
          </div>

          {/* Mechanic */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mechanic Name</label>
              <Input
                placeholder="Full name"
                value={data.mechanic_name ?? ''}
                onChange={(e) => onChange({ ...data, mechanic_name: e.target.value })}
                className={cn('text-sm', isAutoPopulated('mechanic_name') && 'bg-blue-50')}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Certificate #</label>
              <Input
                placeholder="A&P / IA #"
                value={data.mechanic_cert ?? ''}
                onChange={(e) => onChange({ ...data, mechanic_cert: e.target.value })}
                className={cn('text-sm', isAutoPopulated('mechanic_cert') && 'bg-blue-50')}
              />
            </div>
          </div>

          {/* References */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">AD Reference</label>
              <Input
                placeholder="e.g. 2023-12-04"
                value={data.ad_reference ?? ''}
                onChange={(e) => onChange({ ...data, ad_reference: e.target.value })}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">SB Reference</label>
              <Input
                placeholder="e.g. SB-M20-101"
                value={data.sb_reference ?? ''}
                onChange={(e) => onChange({ ...data, sb_reference: e.target.value })}
                className="text-sm"
              />
            </div>
          </div>

          {/* Parts Used */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Parts Used</label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() =>
                  onChange({
                    ...data,
                    parts_used: [
                      ...(data.parts_used ?? []),
                      { part_number: '', description: '', qty: 1 },
                    ],
                  })
                }
              >
                <PlusCircle className="h-3 w-3 mr-1" /> Add Part
              </Button>
            </div>
            {(data.parts_used ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No parts recorded</p>
            ) : (
              <div className="space-y-2">
                {(data.parts_used ?? []).map((part, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2fr_60px_28px] gap-1 items-center">
                    <Input
                      placeholder="P/N"
                      value={part.part_number}
                      onChange={(e) => {
                        const parts = [...(data.parts_used ?? [])]
                        parts[i] = { ...parts[i], part_number: e.target.value }
                        onChange({ ...data, parts_used: parts })
                      }}
                      className="text-xs h-7"
                    />
                    <Input
                      placeholder="Description"
                      value={part.description}
                      onChange={(e) => {
                        const parts = [...(data.parts_used ?? [])]
                        parts[i] = { ...parts[i], description: e.target.value }
                        onChange({ ...data, parts_used: parts })
                      }}
                      className="text-xs h-7"
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={part.qty}
                      onChange={(e) => {
                        const parts = [...(data.parts_used ?? [])]
                        parts[i] = { ...parts[i], qty: parseInt(e.target.value) || 1 }
                        onChange({ ...data, parts_used: parts })
                      }}
                      className="text-xs h-7"
                    />
                    <button
                      onClick={() => {
                        const parts = [...(data.parts_used ?? [])]
                        parts.splice(i, 1)
                        onChange({ ...data, parts_used: parts })
                      }}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Auto-populated note */}
          {isAutoPopulated('description') && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-700">
              <Bot className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>Fields highlighted in blue were auto-populated by AI. Review before finalizing.</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Action bar */}
      <div className="p-3 border-t border-border flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="text-xs h-7">
          Save Draft
        </Button>
        <Button size="sm" className="text-xs h-7 bg-brand-600 hover:bg-brand-700">
          Finalize
        </Button>
        <Button size="sm" variant="outline" className="text-xs h-7">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Sign
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="text-xs h-7">
          <Download className="h-3 w-3 mr-1" /> PDF
        </Button>
        <Button size="sm" variant="ghost" className="text-xs h-7">
          <Share2 className="h-3 w-3 mr-1" /> Share
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function WorkOrderArtifact({
  data,
  onChange,
}: {
  data: WorkOrderData
  onChange: (d: WorkOrderData) => void
}) {
  const laborTotal = (data.labor_lines ?? []).reduce(
    (sum, l) => sum + l.hours * l.rate,
    0
  )
  const partsTotal = (data.parts_lines ?? []).reduce(
    (sum, p) => sum + p.qty * p.unit_price,
    0
  )
  const total = laborTotal + partsTotal

  const statusColors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-amber-100 text-amber-800',
    pending_parts: 'bg-orange-100 text-orange-800',
    complete: 'bg-green-100 text-green-800',
    invoiced: 'bg-purple-100 text-purple-800',
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Wrench className="h-4 w-4 text-brand-600" />
        <span className="font-semibold text-sm text-foreground">
          {data.wo_number ?? 'Work Order'}
        </span>
        <Badge
          className={cn('text-xs', statusColors[data.status ?? 'open'])}
          variant="outline"
        >
          {(data.status ?? 'open').replace(/_/g, ' ')}
        </Badge>
        <div className="ml-auto">
          <Select
            value={data.status ?? 'open'}
            onValueChange={(v) =>
              onChange({ ...data, status: v as WorkOrderData['status'] })
            }
          >
            <SelectTrigger className="h-7 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="pending_parts">Pending Parts</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="invoiced">Invoiced</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="summary" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-3 h-8 w-auto justify-start gap-1 bg-muted/50">
          {['summary', 'labor', 'parts', 'notes'].map((t) => (
            <TabsTrigger key={t} value={t} className="text-xs h-6 capitalize px-3">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>

        <ScrollArea className="flex-1">
          <div className="p-4">
            <TabsContent value="summary" className="space-y-3 mt-0">
              {(
                [
                  ['complaint', 'Customer Complaint'],
                  ['discrepancy', 'Discrepancy Found'],
                  ['findings', 'Findings'],
                  ['corrective_action', 'Corrective Action'],
                ] as [keyof WorkOrderData, string][]
              ).map(([field, label]) => (
                <div key={field}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    {label}
                  </label>
                  <Textarea
                    rows={3}
                    placeholder={`Enter ${label.toLowerCase()}…`}
                    value={(data[field] as string) ?? ''}
                    onChange={(e) => onChange({ ...data, [field]: e.target.value })}
                    className="text-sm resize-none"
                  />
                </div>
              ))}
            </TabsContent>

            <TabsContent value="labor" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Labor Lines
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() =>
                    onChange({
                      ...data,
                      labor_lines: [
                        ...(data.labor_lines ?? []),
                        { description: '', hours: 1, rate: 85 },
                      ],
                    })
                  }
                >
                  <PlusCircle className="h-3 w-3 mr-1" /> Add Line
                </Button>
              </div>
              <div className="space-y-2">
                {(data.labor_lines ?? []).map((line, i) => (
                  <div key={i} className="grid grid-cols-[2fr_70px_70px_28px] gap-1 items-center">
                    <Input
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => {
                        const lines = [...(data.labor_lines ?? [])]
                        lines[i] = { ...lines[i], description: e.target.value }
                        onChange({ ...data, labor_lines: lines })
                      }}
                      className="text-xs h-7"
                    />
                    <Input
                      type="number"
                      step="0.5"
                      placeholder="Hrs"
                      value={line.hours}
                      onChange={(e) => {
                        const lines = [...(data.labor_lines ?? [])]
                        lines[i] = { ...lines[i], hours: parseFloat(e.target.value) || 0 }
                        onChange({ ...data, labor_lines: lines })
                      }}
                      className="text-xs h-7"
                    />
                    <Input
                      type="number"
                      placeholder="Rate"
                      value={line.rate}
                      onChange={(e) => {
                        const lines = [...(data.labor_lines ?? [])]
                        lines[i] = { ...lines[i], rate: parseFloat(e.target.value) || 0 }
                        onChange({ ...data, labor_lines: lines })
                      }}
                      className="text-xs h-7"
                    />
                    <button
                      onClick={() => {
                        const lines = [...(data.labor_lines ?? [])]
                        lines.splice(i, 1)
                        onChange({ ...data, labor_lines: lines })
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="text-right text-sm font-semibold text-foreground">
                Labor: ${laborTotal.toFixed(2)}
              </div>
            </TabsContent>

            <TabsContent value="parts" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Parts
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() =>
                    onChange({
                      ...data,
                      parts_lines: [
                        ...(data.parts_lines ?? []),
                        { part_number: '', description: '', qty: 1, unit_price: 0 },
                      ],
                    })
                  }
                >
                  <PlusCircle className="h-3 w-3 mr-1" /> Add Part
                </Button>
              </div>
              <div className="space-y-2">
                {(data.parts_lines ?? []).map((part, i) => (
                  <div key={i} className="grid grid-cols-[80px_1fr_50px_70px_28px] gap-1 items-center">
                    <Input
                      placeholder="P/N"
                      value={part.part_number}
                      onChange={(e) => {
                        const parts = [...(data.parts_lines ?? [])]
                        parts[i] = { ...parts[i], part_number: e.target.value }
                        onChange({ ...data, parts_lines: parts })
                      }}
                      className="text-xs h-7"
                    />
                    <Input
                      placeholder="Description"
                      value={part.description}
                      onChange={(e) => {
                        const parts = [...(data.parts_lines ?? [])]
                        parts[i] = { ...parts[i], description: e.target.value }
                        onChange({ ...data, parts_lines: parts })
                      }}
                      className="text-xs h-7"
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={part.qty}
                      onChange={(e) => {
                        const parts = [...(data.parts_lines ?? [])]
                        parts[i] = { ...parts[i], qty: parseInt(e.target.value) || 1 }
                        onChange({ ...data, parts_lines: parts })
                      }}
                      className="text-xs h-7"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Price"
                      value={part.unit_price}
                      onChange={(e) => {
                        const parts = [...(data.parts_lines ?? [])]
                        parts[i] = { ...parts[i], unit_price: parseFloat(e.target.value) || 0 }
                        onChange({ ...data, parts_lines: parts })
                      }}
                      className="text-xs h-7"
                    />
                    <button
                      onClick={() => {
                        const parts = [...(data.parts_lines ?? [])]
                        parts.splice(i, 1)
                        onChange({ ...data, parts_lines: parts })
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="text-right space-y-1 pt-2 border-t border-border">
                <div className="text-xs text-muted-foreground">Parts: ${partsTotal.toFixed(2)}</div>
                <div className="text-sm font-bold text-foreground">Total: ${total.toFixed(2)}</div>
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-0">
              <Textarea
                rows={8}
                placeholder="Internal notes…"
                value={data.notes ?? ''}
                onChange={(e) => onChange({ ...data, notes: e.target.value })}
                className="text-sm resize-none"
              />
            </TabsContent>
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border flex items-center gap-2 flex-wrap">
          <Button size="sm" className="text-xs h-7 bg-brand-600 hover:bg-brand-700">
            Save
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7">
            <DollarSign className="h-3 w-3 mr-1" /> Generate Invoice
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7">
            <FileText className="h-3 w-3 mr-1" /> Logbook Entry
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="text-xs h-7">
            <Share2 className="h-3 w-3 mr-1" /> Share
          </Button>
        </div>
      </Tabs>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function InvoiceArtifact({
  data,
  onChange,
}: {
  data: InvoiceData
  onChange: (d: InvoiceData) => void
}) {
  const subtotal = (data.line_items ?? []).reduce(
    (sum, item) => sum + item.qty * item.unit_price,
    0
  )
  const tax = subtotal * ((data.tax_rate ?? 0) / 100)
  const total = subtotal + tax

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-brand-600" />
        <span className="font-semibold text-sm text-foreground">
          {data.invoice_number ?? 'Invoice'}
        </span>
        <Badge
          className={cn('text-xs', statusColors[data.status ?? 'draft'])}
          variant="outline"
        >
          {data.status ?? 'draft'}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Preview card */}
          <div className="rounded-lg border border-border bg-white shadow-sm p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-lg text-foreground">INVOICE</div>
                <div className="text-xs text-muted-foreground">
                  {data.invoice_number}
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground space-y-0.5">
                <div>Date: {data.invoice_date}</div>
                <div>Due: {data.due_date}</div>
              </div>
            </div>

            {/* Bill To */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Bill To
              </div>
              <Input
                placeholder="Customer name"
                value={data.customer_name ?? ''}
                onChange={(e) => onChange({ ...data, customer_name: e.target.value })}
                className="text-sm mb-1"
              />
              <Input
                placeholder="Email address"
                value={data.customer_email ?? ''}
                onChange={(e) => onChange({ ...data, customer_email: e.target.value })}
                className="text-sm mb-1"
              />
              <Textarea
                rows={2}
                placeholder="Address"
                value={data.customer_address ?? ''}
                onChange={(e) => onChange({ ...data, customer_address: e.target.value })}
                className="text-sm resize-none"
              />
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Line Items
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() =>
                    onChange({
                      ...data,
                      line_items: [
                        ...(data.line_items ?? []),
                        { description: '', qty: 1, unit_price: 0 },
                      ],
                    })
                  }
                >
                  <PlusCircle className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-1.5">
                {(data.line_items ?? []).map((item, i) => (
                  <div key={i} className="grid grid-cols-[2fr_50px_80px_28px] gap-1 items-center">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => {
                        const items = [...(data.line_items ?? [])]
                        items[i] = { ...items[i], description: e.target.value }
                        onChange({ ...data, line_items: items })
                      }}
                      className="text-xs h-7"
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={item.qty}
                      onChange={(e) => {
                        const items = [...(data.line_items ?? [])]
                        items[i] = { ...items[i], qty: parseInt(e.target.value) || 1 }
                        onChange({ ...data, line_items: items })
                      }}
                      className="text-xs h-7"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Price"
                      value={item.unit_price}
                      onChange={(e) => {
                        const items = [...(data.line_items ?? [])]
                        items[i] = { ...items[i], unit_price: parseFloat(e.target.value) || 0 }
                        onChange({ ...data, line_items: items })
                      }}
                      className="text-xs h-7"
                    />
                    <button
                      onClick={() => {
                        const items = [...(data.line_items ?? [])]
                        items.splice(i, 1)
                        onChange({ ...data, line_items: items })
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="border-t border-border pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Tax</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={data.tax_rate ?? 0}
                    onChange={(e) =>
                      onChange({ ...data, tax_rate: parseFloat(e.target.value) || 0 })
                    }
                    className="w-14 h-6 text-xs text-right"
                  />
                  <span className="text-xs">%</span>
                  <span className="ml-1">${tax.toFixed(2)}</span>
                </div>
              </div>
              <div className="flex justify-between font-bold text-foreground border-t border-border pt-1 mt-1">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border flex items-center gap-2 flex-wrap">
        <Button size="sm" className="text-xs h-7 bg-brand-600 hover:bg-brand-700">
          Save
        </Button>
        <Button size="sm" variant="outline" className="text-xs h-7">
          <Mail className="h-3 w-3 mr-1" /> Email
        </Button>
        <Button size="sm" variant="outline" className="text-xs h-7">
          <Download className="h-3 w-3 mr-1" /> PDF
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7"
          onClick={() =>
            onChange({ ...data, status: 'paid' })
          }
        >
          <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Paid
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="text-xs h-7">
          <Share2 className="h-3 w-3 mr-1" /> Share
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function PartsSearchArtifact({
  data,
  onAddToWorkOrder,
}: {
  data: PartsSearchData
  onAddToWorkOrder?: (part: PartsResult) => void
}) {
  const confidenceColors: Record<string, string> = {
    high: 'bg-green-100 text-green-800',
    medium: 'bg-amber-100 text-amber-800',
    low: 'bg-red-100 text-red-800',
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Search className="h-4 w-4 text-brand-600" />
        <span className="font-semibold text-sm text-foreground">Parts Search</span>
        {data.results && (
          <Badge variant="outline" className="text-xs">
            {data.results.length} results
          </Badge>
        )}
      </div>

      <div className="px-4 py-2 border-b border-border">
        <p className="text-xs text-muted-foreground">
          Query: <span className="font-medium text-foreground">{data.query}</span>
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {(data.results ?? []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No results yet. Ask the AI to search for a specific part number or description.
            </div>
          ) : (
            (data.results ?? []).map((part, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-white p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm font-semibold text-foreground">
                      {part.part_number}
                    </div>
                    <div className="text-sm text-muted-foreground">{part.description}</div>
                  </div>
                  <Badge
                    className={cn(
                      'text-xs flex-shrink-0',
                      confidenceColors[part.fit_confidence]
                    )}
                    variant="outline"
                  >
                    {part.fit_confidence} fit
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Source: {part.source}</span>
                  {part.price !== undefined && (
                    <span className="font-medium text-foreground">
                      ${part.price.toFixed(2)}
                    </span>
                  )}
                  {part.availability && <span>{part.availability}</span>}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-6"
                    onClick={() => onAddToWorkOrder?.(part)}
                  >
                    <Wrench className="h-3 w-3 mr-1" /> Add to Work Order
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-6 text-green-700">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm Fit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-6 text-amber-700">
                    <AlertTriangle className="h-3 w-3 mr-1" /> Flag
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty artifact state
// ─────────────────────────────────────────────────────────────────────────────

function ArtifactEmptyState({
  onOpen,
  persona,
}: {
  onOpen: (type: ArtifactType) => void
  persona: 'owner' | 'mechanic'
}) {
  const items = persona === 'mechanic'
    ? [
    {
      type: 'logbook_entry' as ArtifactType,
      icon: FileText,
      label: 'Logbook Entry',
      desc: 'Create or edit a maintenance entry',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      type: 'work_order' as ArtifactType,
      icon: Wrench,
      label: 'Work Order',
      desc: 'Open a WO with labor & parts',
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      type: 'invoice' as ArtifactType,
      icon: DollarSign,
      label: 'Invoice',
      desc: 'Bill a customer for services',
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      type: 'parts_search' as ArtifactType,
      icon: Search,
      label: 'Parts Search',
      desc: 'Find parts for this aircraft',
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
  ]
    : []

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-6">
      <div>
        <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-3">
          <ClipboardList className="h-7 w-7 text-brand-600" />
        </div>
        <h3 className="font-semibold text-foreground text-sm">Your workspace will appear here</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          {persona === 'mechanic'
            ? 'Ask the AI to prepare a document or click below to open one directly.'
            : 'Owner mode is evidence-first. Ask questions about records, maintenance history, inspections, and compliance for the selected aircraft.'}
        </p>
      </div>
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
          {items.map(({ type, icon: Icon, label, desc, color, bg }) => (
            <button
              key={type}
              onClick={() => onOpen(type)}
              className="flex flex-col items-start gap-1.5 p-3 rounded-lg border border-border hover:border-brand-300 hover:bg-brand-50/40 transition-all text-left"
            >
              <div className={cn('w-7 h-7 rounded-md flex items-center justify-center', bg)}>
                <Icon className={cn('h-3.5 w-3.5', color)} />
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground">{label}</div>
                <div className="text-xs text-muted-foreground leading-tight">{desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dots loading indicator
// ─────────────────────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
        <Bot className="h-3.5 w-3.5 text-brand-600" />
      </div>
      <div className="flex items-center gap-1 bg-white border border-border rounded-2xl rounded-tl-sm px-3 py-2.5">
        <span
          className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Thread list item
// ─────────────────────────────────────────────────────────────────────────────

function ThreadItem({
  thread,
  isActive,
  aircraft,
  onSelect,
  onPin,
  onRename,
  onDelete,
}: {
  thread: Thread
  isActive: boolean
  aircraft: Aircraft[]
  onSelect: () => void
  onPin: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const linkedAircraft = aircraft.find((a) => a.id === thread.aircraft_id)

  return (
    <div
      className={cn(
        'group flex items-start gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors relative',
        isActive
          ? 'bg-brand-50 text-brand-700'
          : 'hover:bg-accent text-muted-foreground hover:text-foreground'
      )}
      onClick={onSelect}
    >
      <MessageSquare className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-xs font-medium truncate',
            isActive ? 'text-brand-700' : 'text-foreground'
          )}
        >
          {thread.title || 'New conversation'}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-muted-foreground">
            {relativeTime(thread.updated_at)}
          </span>
          {linkedAircraft && (
            <span className="text-[10px] font-mono bg-muted rounded px-1">
              {linkedAircraft.tail_number}
            </span>
          )}
          {thread.is_pinned && (
            <Pin className="h-2.5 w-2.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-0.5 rounded hover:bg-accent-foreground/10"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPin() }}>
              <Pin className="h-3.5 w-3.5 mr-2" />
              {thread.is_pinned ? 'Unpin' : 'Pin'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename() }}>
              <Edit3 className="h-3.5 w-3.5 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Artifact label for assistant message chips
// ─────────────────────────────────────────────────────────────────────────────

const ARTIFACT_LABELS: Record<string, string> = {
  logbook_entry: 'Logbook Entry',
  work_order: 'Work Order',
  invoice: 'Invoice',
  parts_search: 'Parts Search',
}

const ARTIFACT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  logbook_entry: FileText,
  work_order: Wrench,
  invoice: DollarSign,
  parts_search: Search,
}

// ─────────────────────────────────────────────────────────────────────────────
// Main workspace component
// ─────────────────────────────────────────────────────────────────────────────

export function WorkspaceClient({
  organizationId,
  userId,
  aircraft,
  initialThreads,
  initialAircraftId = null,
}: WorkspaceClientProps) {
  const router = useTenantRouter()
  const searchParams = useSearchParams()
  const { persona } = useAppContext()
  // State
  const [messages, setMessages] = useState<Message[]>([])
  const [activeArtifact, setActiveArtifact] = useState<ActiveArtifact | null>(null)
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(initialAircraftId)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [threads, setThreads] = useState<Thread[]>(initialThreads)
  const [isLoading, setIsLoading] = useState(false)
  const [input, setInput] = useState('')
  const [threadSearch, setThreadSearch] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const suggestedPrompts = useMemo(
    () => (persona === 'mechanic' ? MECHANIC_SUGGESTED_PROMPTS : OWNER_SUGGESTED_PROMPTS),
    [persona]
  )

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 96) + 'px'
  }, [input])

  const selectedAircraft = aircraft.find((a) => a.id === selectedAircraftId) ?? null

  useEffect(() => {
    if (selectedAircraftId && aircraft.some((candidate) => candidate.id === selectedAircraftId)) {
      return
    }

    const requestedAircraftId = searchParams.get('aircraft') ?? initialAircraftId
    if (requestedAircraftId && aircraft.some((candidate) => candidate.id === requestedAircraftId)) {
      setSelectedAircraftId(requestedAircraftId)
      return
    }

    if (typeof window !== 'undefined') {
      const persisted = window.localStorage.getItem(OWNER_SELECTED_AIRCRAFT_STORAGE_KEY)?.trim()
      if (persisted && aircraft.some((candidate) => candidate.id === persisted)) {
        setSelectedAircraftId(persisted)
        return
      }
    }

    if (aircraft.length === 1) {
      setSelectedAircraftId(aircraft[0].id)
      return
    }

    setSelectedAircraftId(null)
  }, [aircraft, initialAircraftId, searchParams, selectedAircraftId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (persona !== 'owner') return
    if (!selectedAircraftId) return
    window.localStorage.setItem(OWNER_SELECTED_AIRCRAFT_STORAGE_KEY, selectedAircraftId)
  }, [persona, selectedAircraftId])

  const updateAircraftSelection = useCallback(
    (nextAircraftId: string | null) => {
      setSelectedAircraftId(nextAircraftId)
      const params = new URLSearchParams(searchParams.toString())
      if (nextAircraftId) {
        params.set('aircraft', nextAircraftId)
      } else {
        params.delete('aircraft')
      }
      const query = params.toString()
      router.push(query ? `/workspace?${query}` : '/workspace', { scroll: false })
    },
    [router, searchParams]
  )

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || isLoading) return

      setInput('')

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)

      try {
        const history = messages
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content }))

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: trimmed,
            threadId: activeThreadId,
            aircraftId: selectedAircraftId,
            conversationHistory: history,
            organizationId,
            persona,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: data.error ?? 'Something went wrong. Please try again.',
              timestamp: new Date(),
            },
          ])
          return
        }

        const { reply, intent, artifactType, artifactData, threadTitle } = data

        // Build assistant message
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: reply ?? '',
          intent,
          artifactType: artifactType ?? null,
          artifactData: artifactData ?? undefined,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMsg])

        // Open artifact if returned
        if (artifactType && artifactData) {
          setActiveArtifact({ type: artifactType, data: artifactData })
        }

        // Update thread list if we got a title back
        if (!activeThreadId) {
          const newThread: Thread = {
            id: data.threadId ?? crypto.randomUUID(),
            title: threadTitle || buildThreadTitle(trimmed),
            aircraft_id: selectedAircraftId,
            is_pinned: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          setThreads((prev) => [newThread, ...prev])
          setActiveThreadId(newThread.id)
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Network error. Please check your connection and try again.',
            timestamp: new Date(),
          },
        ])
      } finally {
        setIsLoading(false)
        textareaRef.current?.focus()
      }
    },
    [messages, isLoading, activeThreadId, selectedAircraftId, organizationId, persona]
  )

  // ── Open artifact ──────────────────────────────────────────────────────────

  function openArtifact(type: ArtifactType, data?: ActiveArtifact['data']) {
    if (!type) return
    const defaultData =
      data ??
      (type === 'logbook_entry'
        ? makeLogbookPlaceholder()
        : type === 'work_order'
        ? makeWorkOrderPlaceholder()
        : type === 'invoice'
        ? makeInvoicePlaceholder()
        : makePartsPlaceholder(''))
    setActiveArtifact({ type, data: defaultData })
  }

  // ── Thread management ──────────────────────────────────────────────────────

  function newThread() {
    setActiveThreadId(null)
    setMessages([])
    setActiveArtifact(null)
  }

  function selectThread(thread: Thread) {
    setActiveThreadId(thread.id)
    setMessages([]) // in production, load from DB
    setActiveArtifact(null)
    if (thread.aircraft_id) {
      updateAircraftSelection(thread.aircraft_id)
    }
  }

  function togglePin(threadId: string) {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId ? { ...t, is_pinned: !t.is_pinned } : t
      )
    )
  }

  function deleteThread(threadId: string) {
    setThreads((prev) => prev.filter((t) => t.id !== threadId))
    if (activeThreadId === threadId) newThread()
  }

  function renameThread(threadId: string) {
    const newTitle = window.prompt('Rename thread:')
    if (newTitle) {
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title: newTitle } : t))
      )
    }
  }

  // ── Keyboard handler ───────────────────────────────────────────────────────

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredThreads = threads.filter((t) =>
    t.title.toLowerCase().includes(threadSearch.toLowerCase())
  )
  const pinnedThreads = filteredThreads.filter((t) => t.is_pinned)
  const todayThreads = filteredThreads.filter(
    (t) => !t.is_pinned && threadGroup(t.updated_at) === 'today'
  )
  const yesterdayThreads = filteredThreads.filter(
    (t) => !t.is_pinned && threadGroup(t.updated_at) === 'yesterday'
  )
  const earlierThreads = filteredThreads.filter(
    (t) => !t.is_pinned && threadGroup(t.updated_at) === 'earlier'
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── LEFT PANEL ── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-border bg-gray-50">
        {/* Aircraft selector */}
        <div className="p-3 border-b border-border space-y-2">
          <Select
            value={selectedAircraftId ?? 'all'}
            onValueChange={(v) => updateAircraftSelection(v === 'all' ? null : v)}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="All aircraft" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Plane className="h-3.5 w-3.5" />
                  <span>All Aircraft</span>
                </div>
              </SelectItem>
              {aircraft.map((ac) => (
                <SelectItem key={ac.id} value={ac.id}>
                  <div className="flex items-center gap-2">
                    <Plane className="h-3.5 w-3.5" />
                    <span className="font-mono text-xs">{ac.tail_number}</span>
                    <span className="text-muted-foreground text-xs">
                      {ac.make} {ac.model}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Aircraft context badge */}
          {selectedAircraft && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-brand-50 border border-brand-100">
              <div className="w-6 h-6 rounded-md bg-brand-600 flex items-center justify-center flex-shrink-0">
                <Plane className="h-3 w-3 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-mono font-bold text-brand-700">
                  {selectedAircraft.tail_number}
                </p>
                <p className="text-[10px] text-brand-600 truncate">
                  {selectedAircraft.make} {selectedAircraft.model}
                  {selectedAircraft.year ? ` • ${selectedAircraft.year}` : ''}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* New conversation */}
        <div className="p-3 border-b border-border">
          <Button
            onClick={newThread}
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            New Conversation
          </Button>
        </div>

        {/* Thread search */}
        <div className="px-3 pt-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search threads…"
              className="pl-6 h-7 text-xs"
            />
          </div>
        </div>

        {/* Thread list */}
        <ScrollArea className="flex-1 px-2 pt-2">
          {filteredThreads.length === 0 && (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No conversations yet.
              <br />
              Start a new one above.
            </div>
          )}

          {/* Pinned */}
          {pinnedThreads.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1 flex items-center gap-1">
                <Pin className="h-2.5 w-2.5" /> Pinned
              </p>
              {pinnedThreads.map((t) => (
                <ThreadItem
                  key={t.id}
                  thread={t}
                  isActive={t.id === activeThreadId}
                  aircraft={aircraft}
                  onSelect={() => selectThread(t)}
                  onPin={() => togglePin(t.id)}
                  onRename={() => renameThread(t.id)}
                  onDelete={() => deleteThread(t.id)}
                />
              ))}
            </div>
          )}

          {/* Today */}
          {todayThreads.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
                Today
              </p>
              {todayThreads.map((t) => (
                <ThreadItem
                  key={t.id}
                  thread={t}
                  isActive={t.id === activeThreadId}
                  aircraft={aircraft}
                  onSelect={() => selectThread(t)}
                  onPin={() => togglePin(t.id)}
                  onRename={() => renameThread(t.id)}
                  onDelete={() => deleteThread(t.id)}
                />
              ))}
            </div>
          )}

          {/* Yesterday */}
          {yesterdayThreads.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
                Yesterday
              </p>
              {yesterdayThreads.map((t) => (
                <ThreadItem
                  key={t.id}
                  thread={t}
                  isActive={t.id === activeThreadId}
                  aircraft={aircraft}
                  onSelect={() => selectThread(t)}
                  onPin={() => togglePin(t.id)}
                  onRename={() => renameThread(t.id)}
                  onDelete={() => deleteThread(t.id)}
                />
              ))}
            </div>
          )}

          {/* Earlier */}
          {earlierThreads.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
                Earlier
              </p>
              {earlierThreads.map((t) => (
                <ThreadItem
                  key={t.id}
                  thread={t}
                  isActive={t.id === activeThreadId}
                  aircraft={aircraft}
                  onSelect={() => selectThread(t)}
                  onPin={() => togglePin(t.id)}
                  onRename={() => renameThread(t.id)}
                  onDelete={() => deleteThread(t.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── CENTER PANEL ── */}
      <div className="flex-1 min-w-0 flex flex-col bg-white">
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-border flex items-center gap-3">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            {activeThreadId
              ? threads.find((t) => t.id === activeThreadId)?.title ?? 'Conversation'
              : 'New Conversation'}
          </span>
          {selectedAircraft && (
            <Badge variant="outline" className="text-xs font-mono ml-1">
              {selectedAircraft.tail_number}
            </Badge>
          )}
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-5 py-4">
          {messages.length === 0 ? (
            /* Empty / splash state */
            <div className="h-full flex flex-col items-center justify-center gap-6 py-12 max-w-lg mx-auto text-center">
              <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                  <path
                    d="M28 16L4 8L10 16L4 24L28 16Z"
                    fill="#3b82f6"
                    stroke="#60a5fa"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  What can I help you with?
                </h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {persona === 'mechanic'
                    ? 'I can prepare logbook entries, work orders, invoices, look up parts, check AD compliance, and answer questions about your aircraft records.'
                    : 'I can answer questions about aircraft records, maintenance history, inspections, compliance, and document evidence for the selected aircraft.'}
                </p>
              </div>

              {/* Suggested prompts */}
              <div className="grid grid-cols-2 gap-2 w-full">
                {suggestedPrompts.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    onClick={() => sendMessage(label)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border hover:border-brand-300 hover:bg-brand-50 transition-all text-left text-sm text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5 max-w-2xl">
              {messages.map((msg) =>
                msg.role === 'user' ? (
                  /* User bubble */
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[75%] bg-brand-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5">
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-[10px] text-brand-200 mt-1 text-right">
                        {msg.timestamp.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Assistant message */
                  <div key={msg.id} className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="bg-white border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          {msg.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>

                      {/* Artifact chip */}
                      {msg.artifactType && (
                        <div className="flex items-center gap-2">
                          {(() => {
                            const Icon = ARTIFACT_ICONS[msg.artifactType] ?? FileText
                            return (
                              <button
                                onClick={() =>
                                  openArtifact(msg.artifactType!, msg.artifactData)
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-brand-200 bg-brand-50 text-brand-700 text-xs font-medium hover:bg-brand-100 transition-colors"
                              >
                                <Icon className="h-3 w-3" />
                                Opened{' '}
                                {ARTIFACT_LABELS[msg.artifactType] ?? msg.artifactType}
                                <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
                              </button>
                            )
                          })()}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-accent">
                          Edit in workspace
                        </button>
                        <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-accent">
                          Save draft
                        </button>
                        <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-accent">
                          Share
                        </button>
                      </div>
                    </div>
                  </div>
                )
              )}

              {isLoading && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input bar */}
        <div className="flex-shrink-0 p-4 border-t border-border">
          <div className="relative flex items-end gap-2 rounded-xl border border-border bg-white shadow-sm px-3 py-2 focus-within:ring-2 focus-within:ring-brand-300 focus-within:border-brand-400 transition-all">
            {selectedAircraft && (
              <div className="absolute top-2 left-3 flex items-center">
                <Badge variant="outline" className="text-[10px] font-mono h-5 px-1.5 bg-brand-50 text-brand-700 border-brand-200">
                  {selectedAircraft.tail_number}
                </Badge>
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedAircraft
                  ? `Ask about ${selectedAircraft.tail_number}…`
                  : 'Ask me anything about your aircraft…'
              }
              className={cn(
                'flex-1 resize-none border-0 shadow-none focus-visible:ring-0 text-sm min-h-[36px] max-h-24 py-1 bg-transparent',
                selectedAircraft && 'pt-6'
              )}
              rows={1}
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              size="sm"
              className="h-8 w-8 p-0 flex-shrink-0 bg-brand-600 hover:bg-brand-700 disabled:opacity-40"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="w-[420px] flex-shrink-0 flex flex-col border-l border-border bg-gray-50">
        {/* Panel header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center gap-2">
          {activeArtifact ? (
            <>
              {(() => {
                const Icon =
                  (activeArtifact.type && ARTIFACT_ICONS[activeArtifact.type]) ??
                  FileText
                return <Icon className="h-4 w-4 text-brand-600" />
              })()}
              <span className="text-sm font-semibold text-foreground flex-1">
                {(activeArtifact.type && ARTIFACT_LABELS[activeArtifact.type]) ??
                  'Workspace'}
              </span>
              <button
                onClick={() => setActiveArtifact(null)}
                className="text-muted-foreground hover:text-foreground transition-colors ml-auto"
                aria-label="Close artifact"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Workspace</span>
            </>
          )}
        </div>

        {/* Artifact content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {!activeArtifact ? (
            <ArtifactEmptyState onOpen={openArtifact} persona={persona} />
          ) : activeArtifact.type === 'logbook_entry' ? (
            <LogbookEntryArtifact
              data={activeArtifact.data as LogbookEntryData}
              onChange={(d) =>
                setActiveArtifact({ type: 'logbook_entry', data: d })
              }
            />
          ) : activeArtifact.type === 'work_order' ? (
            <WorkOrderArtifact
              data={activeArtifact.data as WorkOrderData}
              onChange={(d) => setActiveArtifact({ type: 'work_order', data: d })}
            />
          ) : activeArtifact.type === 'invoice' ? (
            <InvoiceArtifact
              data={activeArtifact.data as InvoiceData}
              onChange={(d) => setActiveArtifact({ type: 'invoice', data: d })}
            />
          ) : activeArtifact.type === 'parts_search' ? (
            <PartsSearchArtifact
              data={activeArtifact.data as PartsSearchData}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
