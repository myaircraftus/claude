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
  Banknote,
  CheckCircle2,
  CreditCard,
  FileText,
  Printer,
  Receipt,
  Search,
  Send,
  ShieldCheck,
} from 'lucide-react'

type SourceType = 'work_order' | 'aircraft' | 'estimate' | 'custom'

type Props = {
  invoices: any[]
  workOrders: any[]
  estimates: any[]
  aircraft: any[]
  customers: any[]
  /** Owner persona — read-only: the create-invoice control is hidden. */
  isOwner?: boolean
}

const FLOW_STEPS = [
  ['Open Invoices', 'Global billing queue'],
  ['Choose Source', 'WO, aircraft, estimate, custom'],
  ['Auto Map', 'Aircraft, owner, actuals, deposit'],
  ['Review Lines', 'Actual labor, parts, taxes, credits'],
  ['Sign & Send', 'Email, SMS link, PDF, print/share'],
  ['Collect Payment', 'Card, Zelle proof, cash/check/manual'],
  ['Close Out', 'Receipt, aircraft timeline, accounting'],
]

const SOURCE_CARDS: Array<{ key: SourceType; title: string; copy: string; badge: string }> = [
  {
    key: 'work_order',
    title: 'From Work Order',
    copy: 'Best for maintenance billing. Pulls approved actual labor, installed parts, deposits, and WO source reference.',
    badge: 'Best for maintenance billing',
  },
  {
    key: 'aircraft',
    title: 'From Aircraft',
    copy: 'Aircraft and owner are locked first. Then choose work order, estimate, or custom invoice.',
    badge: 'Aircraft context locked',
  },
  {
    key: 'estimate',
    title: 'From Estimate',
    copy: 'Planned quote lines come across as estimate references and require review before billing.',
    badge: 'Review required',
  },
  {
    key: 'custom',
    title: 'Custom / Manual Invoice',
    copy: 'Manual labor, parts sale, adjustment, or correction. Aircraft and payee are still required.',
    badge: 'Manual lines',
  },
]

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  ready_to_send: 'bg-blue-50 text-blue-700 border-blue-200',
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  viewed: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  due: 'bg-amber-50 text-amber-700 border-amber-200',
  partially_paid: 'bg-orange-50 text-orange-700 border-orange-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  void: 'bg-slate-50 text-slate-500 border-slate-200',
  refunded: 'bg-purple-50 text-purple-700 border-purple-200',
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value ?? 0))
}

function labelize(value: string | null | undefined) {
  return String(value ?? 'draft').replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase())
}

export function InvoiceWorkflowBoard({ invoices, workOrders, estimates, aircraft, customers, isOwner = false }: Props) {
  const router = useTenantRouter()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceType, setSourceType] = useState<SourceType>('work_order')
  const [aircraftId, setAircraftId] = useState(aircraft[0]?.id ?? '')
  const [payeeId, setPayeeId] = useState(customers[0]?.id ?? '')
  const [workOrderId, setWorkOrderId] = useState('')
  const [estimateId, setEstimateId] = useState('')
  const [manualReason, setManualReason] = useState('Standalone invoice or parts sale')
  const [manualLines, setManualLines] = useState([
    { item_type: 'labor', description: 'Troubleshooting', quantity: 2, unit_price: 95 },
    { item_type: 'part', description: 'Battery', quantity: 1, unit_price: 350 },
  ])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedAircraft = aircraft.find(item => item.id === aircraftId)
  const aircraftWorkOrders = workOrders.filter(wo => !aircraftId || wo.aircraft_id === aircraftId)
  const aircraftEstimates = estimates.filter(est => !aircraftId || est.aircraft_id === aircraftId)
  const selectedWorkOrder = workOrders.find(wo => wo.id === workOrderId) ?? aircraftWorkOrders[0]
  const selectedEstimate = estimates.find(est => est.id === estimateId) ?? aircraftEstimates[0]

  const filteredInvoices = useMemo(() => {
    const q = query.trim().toLowerCase()
    return invoices.filter(inv => {
      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter
      if (!matchesStatus) return false
      if (!q) return true
      return [
        inv.invoice_number,
        inv.aircraft?.tail_number,
        inv.customer?.name,
        inv.payee?.name,
        inv.work_order?.work_order_number,
        inv.estimate?.estimate_number,
      ].some(value => String(value ?? '').toLowerCase().includes(q))
    })
  }, [invoices, query, statusFilter])

  const stats = useMemo(() => {
    const due = invoices.filter(inv => ['due', 'sent', 'partially_paid', 'overdue'].includes(inv.status)).reduce((sum, inv) => sum + Number(inv.balance_due ?? 0), 0)
    return {
      draft: invoices.filter(inv => inv.status === 'draft').length,
      sent: invoices.filter(inv => inv.status === 'sent').length,
      due: invoices.filter(inv => ['due', 'overdue', 'partially_paid'].includes(inv.status)).length,
      paid: invoices.filter(inv => inv.status === 'paid').length,
      outstanding: due,
      pendingProof: invoices.filter(inv => inv.payment_status === 'pending').length,
    }
  }, [invoices])

  async function createInvoice() {
    setCreating(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        source_type: sourceType,
        aircraft_id: aircraftId,
        customer_id: payeeId || undefined,
        payee_id: payeeId || undefined,
        source_context: {
          source_context: 'invoices_module',
          launch_route: '/invoices',
          aircraft_id: aircraftId,
          tail_number: selectedAircraft?.tail_number,
        },
      }
      if (sourceType === 'work_order') payload.work_order_id = workOrderId || selectedWorkOrder?.id
      if (sourceType === 'estimate') payload.estimate_id = estimateId || selectedEstimate?.id
      if (sourceType === 'custom') {
        payload.manual_bypass_reason = manualReason
        payload.manual_lines = manualLines
      }
      if (sourceType === 'aircraft') {
        payload.manual_lines = []
      }

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? `Create failed (${res.status})`)
        return
      }
      router.push(`/invoices/${data.id}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-[1760px] px-5 py-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-normal text-slate-950">Invoices & Payments - Aircraft-Linked Billing Workflow</h1>
            <p className="mt-1 text-sm text-slate-600">
              Generate invoices from work-order actuals, aircraft context, estimates, or custom manual line items. Send, share, print, sign, and collect payment.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">Import</Button>
            <Button variant="outline" size="sm">Filter</Button>
            {/* Owners view invoices read-only — no create control. */}
            {!isOwner && (
              <Button size="sm" onClick={createInvoice} disabled={creating || !aircraftId}>
                + Create Invoice
              </Button>
            )}
          </div>
        </div>

        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-950">Invoice Flow</h2>
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

        <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr_1fr]">
          <Panel title="1. Invoices Dashboard / Queue" subtitle="All invoices across shop. Aircraft-specific invoices also appear under the aircraft record.">
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search invoice, aircraft, owner, work order..."
                className="w-full bg-transparent text-sm outline-none"
              />
              {['all', 'due', 'paid', 'overdue'].map(status => (
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
                ['Draft', stats.draft, 'View', 'bg-slate-50'],
                ['Sent', stats.sent, 'View', 'bg-blue-50'],
                ['Due', stats.due, 'View', 'bg-amber-50'],
                ['Paid', stats.paid, 'View', 'bg-emerald-50'],
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
                    <th className="px-3 py-2 text-left">Invoice</th>
                    <th className="px-3 py-2 text-left">Aircraft</th>
                    <th className="px-3 py-2 text-left">Source</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredInvoices.slice(0, 8).map(invoice => (
                    <tr key={invoice.id} className="hover:bg-blue-50">
                      <td className="px-3 py-3">
                        <Link href={`/invoices/${invoice.id}`} className="font-mono text-xs font-semibold text-blue-700">
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700">{invoice.aircraft?.tail_number ?? 'Unassigned'}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">
                        {invoice.work_order?.work_order_number ?? invoice.estimate?.estimate_number ?? labelize(invoice.source_type)}
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-semibold">{money(invoice.balance_due ?? invoice.total)}</td>
                      <td className="px-3 py-3">
                        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_STYLE[invoice.status] ?? STATUS_STYLE.draft)}>
                          {labelize(invoice.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="2. Create Invoice - Choose Source" subtitle="Invoice creation changes based on where the user starts.">
            <div className="grid gap-3">
              {SOURCE_CARDS.map(card => (
                <button
                  key={card.key}
                  onClick={() => setSourceType(card.key)}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors',
                    sourceType === card.key ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:bg-white'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-950">{card.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{card.copy}</p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-blue-600">{card.badge}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Rule: if no aircraft exists, create aircraft first from tail lookup, then create invoice.
            </div>
          </Panel>

          <Panel title="3. Auto-Mapped Invoice Draft" subtitle="Created from source records. Work-order lines become invoice lines.">
            <div className="grid grid-cols-3 gap-3">
              <SelectBox label="Aircraft *" value={aircraftId} onChange={setAircraftId} options={aircraft.map(item => ({ value: item.id, label: `${item.tail_number} - ${item.make ?? ''} ${item.model ?? ''}`.trim() }))} lock />
              <SelectBox label="Owner / Payee *" value={payeeId} onChange={setPayeeId} options={customers.map(item => ({ value: item.id, label: item.name ?? item.company ?? item.email ?? item.id }))} lock />
              {sourceType === 'work_order' && (
                <SelectBox label="Source WO" value={workOrderId || selectedWorkOrder?.id || ''} onChange={setWorkOrderId} options={aircraftWorkOrders.map(item => ({ value: item.id, label: item.work_order_number ?? item.id }))} lock />
              )}
              {sourceType === 'estimate' && (
                <SelectBox label="Source EST" value={estimateId || selectedEstimate?.id || ''} onChange={setEstimateId} options={aircraftEstimates.map(item => ({ value: item.id, label: item.estimate_number ?? item.id }))} lock />
              )}
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {previewLines(sourceType, selectedWorkOrder, selectedEstimate, manualLines).map((line, index) => (
                    <tr key={`${line.description}-${index}`}>
                      <td className="px-3 py-2 text-xs text-slate-500">{labelize(line.item_type)}</td>
                      <td className="px-3 py-2 text-xs text-slate-900">{line.description}</td>
                      <td className="px-3 py-2 text-right text-xs">{line.quantity}</td>
                      <td className="px-3 py-2 text-right text-xs">{money(line.unit_price)}</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold">{money(line.quantity * line.unit_price)}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{line.source_label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-lg font-semibold text-slate-950">Invoice Totals</p>
              <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
                <Metric label="Subtotal" value={money(previewSubtotal(sourceType, selectedWorkOrder, selectedEstimate, manualLines))} />
                <Metric label="Tax" value={money(previewSubtotal(sourceType, selectedWorkOrder, selectedEstimate, manualLines) * 0.0725)} />
                <Metric label="Deposit Credit" value="Auto-applied" />
                <Metric label="Balance Due" value={money(previewSubtotal(sourceType, selectedWorkOrder, selectedEstimate, manualLines) * 1.0725)} strong />
              </div>
            </div>
          </Panel>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr_1fr]">
          <Panel title="4. Manual Invoice / New Aircraft Path" subtitle="When user starts from Invoices and no aircraft is selected, aircraft is required first.">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3">
              <Input placeholder="Tail Number" defaultValue="N456CD" />
              <Button>FAA Lookup</Button>
              <Button variant="outline" asChild>
                <Link href="/aircraft/new?next=/invoices">Auto-fill aircraft</Link>
              </Button>
            </div>
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
              <p className="font-semibold text-blue-800">FAA Registry Lookup Result</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-blue-900">
                <span>Make / Model: Cessna 182T</span>
                <span>Serial: 182T-99887</span>
                <span>Year: 2018</span>
                <span>Engine: Lycoming IO-540</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Input placeholder="Payee Name" defaultValue="Jane Owner" />
              <Input placeholder="Email" defaultValue="jane@example.com" />
              <Input placeholder="Phone" defaultValue="(555) 100-2030" />
              <Input placeholder="Invoice Type" defaultValue="Custom / Parts Sale" />
            </div>
            <div className="mt-4 space-y-2">
              <Label>Manual Line Items</Label>
              {manualLines.map((line, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_70px_90px] gap-2">
                  <Input value={line.item_type} onChange={event => updateManualLine(index, 'item_type', event.target.value)} />
                  <Input value={line.description} onChange={event => updateManualLine(index, 'description', event.target.value)} />
                  <Input type="number" value={line.quantity} onChange={event => updateManualLine(index, 'quantity', Number(event.target.value))} />
                  <Input type="number" value={line.unit_price} onChange={event => updateManualLine(index, 'unit_price', Number(event.target.value))} />
                </div>
              ))}
              <Input value={manualReason} onChange={event => setManualReason(event.target.value)} placeholder="Audit reason for manual invoice" />
            </div>
          </Panel>

          <Panel title="5. Send, Share, Sign & Payment" subtitle="Invoice can be sent as link, email, SMS, PDF, or printed. Payment can be owner-paid or shop-recorded.">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-3 text-sm font-semibold text-slate-950">Invoice Actions</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { Icon: Send, title: 'Email', copy: 'Send PDF/link' },
                  { Icon: Send, title: 'Text Link', copy: 'SMS payment link' },
                  { Icon: Printer, title: 'Print', copy: 'Paper copy' },
                  { Icon: FileText, title: 'Share', copy: 'Secure link' },
                  { Icon: Receipt, title: 'PDF', copy: 'Download' },
                  { Icon: ShieldCheck, title: 'Sign', copy: 'Digital signature' },
                ].map(({ Icon, title, copy }) => (
                  <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <Icon className="mb-2 h-4 w-4 text-blue-600" />
                    <p className="text-sm font-medium text-slate-900">{title}</p>
                    <p className="text-xs text-slate-500">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {[
                { Icon: CreditCard, title: 'Card / Stripe', copy: 'Owner pays online; receipt auto-created.' },
                { Icon: Banknote, title: 'Zelle', copy: 'Owner uploads proof; admin verifies and marks paid.' },
                { Icon: Banknote, title: 'Cash', copy: 'Mechanic/admin records amount, date, receiver.' },
                { Icon: Receipt, title: 'Check', copy: 'Record check number, amount, date, bank notes.' },
                { Icon: Banknote, title: 'ACH / Other', copy: 'Manual reference and receipt upload.' },
              ].map(({ Icon, title, copy }) => (
                <div key={title} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-slate-500" />
                    <div>
                      <p className="font-semibold text-slate-900">{title}</p>
                      <p className="text-xs text-slate-500">{copy}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">Payment</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              Digital signature stores signer, timestamp, IP/device metadata, invoice hash, and sent/shared audit events.
            </div>
          </Panel>

          <Panel title="6. Invoice Detail / Payment Closeout" subtitle="Click an invoice to see status, source, payment history, signature, and actions.">
            {invoices[0] ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-5 flex items-center gap-2">
                  <h3 className="font-mono text-2xl font-bold text-slate-950">{invoices[0].invoice_number}</h3>
                  <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_STYLE[invoices[0].status] ?? STATUS_STYLE.draft)}>
                    {labelize(invoices[0].status)}
                  </span>
                  {invoices[0].work_order?.work_order_number && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">From {invoices[0].work_order.work_order_number}</span>
                  )}
                </div>
                <p className="text-sm text-slate-500">{invoices[0].aircraft?.tail_number ?? 'Aircraft'} - {invoices[0].payee?.name ?? invoices[0].customer?.name ?? 'Payee'}</p>
                <div className="mt-5 grid grid-cols-5 gap-3 text-sm">
                  <Metric label="Subtotal" value={money(invoices[0].subtotal)} />
                  <Metric label="Tax" value={money(invoices[0].tax_amount)} />
                  <Metric label="Deposit" value={`-${money(invoices[0].deposit_credit_total)}`} />
                  <Metric label="Paid" value={money(invoices[0].amount_paid)} />
                  <Metric label="Balance" value={money(invoices[0].balance_due)} strong />
                </div>
                <div className="mt-6 space-y-3 text-sm">
                  {[
                    ['Created from source', invoices[0].created_at],
                    ['Digital signature added', invoices[0].signed_at],
                    ['Sent by email + SMS', invoices[0].sent_at],
                    ['Owner opened link', invoices[0].viewed_at],
                    ['Payment pending', null],
                  ].map(([title, date], index) => (
                    <div key={title as string} className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="flex items-center gap-2 text-slate-700">
                        {index < 3 ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <span className="h-4 w-4 rounded-full border border-amber-400" />}
                        {title as string}
                      </span>
                      <span className="text-xs text-slate-500">{date ? formatDate(date as string) : 'Now'}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 grid grid-cols-4 gap-2">
                  <Button variant="outline" size="sm" asChild><Link href={`/invoices/${invoices[0].id}`}>Record Payment</Link></Button>
                  <Button variant="outline" size="sm" asChild><Link href={`/invoices/${invoices[0].id}`}>Send Again</Link></Button>
                  <Button variant="outline" size="sm" asChild><Link href={`/api/invoices/${invoices[0].id}/pdf`}>Print</Link></Button>
                  <Button size="sm" asChild><Link href={`/invoices/${invoices[0].id}`}>Mark Paid</Link></Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">No invoices yet.</div>
            )}
          </Panel>
        </div>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-950">Invoice Source-of-Truth Rules</h2>
          <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
            {[
              'From Work Order: invoice pulls actual approved labor, installed parts, taxes, deposit credit, and WO source reference.',
              'From Invoices: user must select aircraft first; if not found, create aircraft from tail lookup and payee details.',
              'Payment proof: Zelle requires owner proof upload or admin verification; cash/check/manual payments require recorder details.',
              'From Aircraft: aircraft and owner are auto-filled; user chooses work order, estimate, or custom invoice.',
              'Custom invoice: manual lines are allowed, but aircraft/payee are still required.',
              'Final invoice, receipt, payment events, signature, and share/send events appear on aircraft timeline and invoice history.',
            ].map(rule => (
              <p key={rule} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{rule}</p>
            ))}
          </div>
          {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </section>
      </div>
    </main>
  )

  function updateManualLine(index: number, key: string, value: string | number) {
    setManualLines(prev => prev.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line))
  }
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

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn('mt-1 text-sm tabular-nums text-slate-700', strong && 'text-lg font-bold text-slate-950')}>{value}</p>
    </div>
  )
}

function previewLines(sourceType: SourceType, workOrder: any, estimate: any, manualLines: any[]) {
  if (sourceType === 'custom') return manualLines.map(line => ({ ...line, source_label: 'Manual' }))
  if (sourceType === 'estimate' && estimate?.line_items?.length) {
    return estimate.line_items.slice(0, 5).map((line: any) => ({
      item_type: line.item_type ?? 'service',
      description: line.description,
      quantity: Number(line.quantity ?? 1),
      unit_price: Number(line.unit_price ?? 0),
      source_label: 'Estimate Reference',
    }))
  }
  if ((sourceType === 'work_order' || sourceType === 'aircraft') && workOrder?.lines?.length) {
    return workOrder.lines
      .filter((line: any) => line.line_type !== 'note' && line.line_type !== 'discrepancy')
      .slice(0, 5)
      .map((line: any) => ({
        item_type: line.line_type ?? 'service',
        description: line.description,
        quantity: Number(line.quantity ?? 1),
        unit_price: Number(line.unit_price ?? 0),
        source_label: line.line_type === 'part' ? 'Installed Part' : line.line_type === 'labor' ? 'WO Actual' : 'Shop Rule',
      }))
  }
  return [
    { item_type: 'labor', description: 'Actual annual inspection labor', quantity: 12, unit_price: 95, source_label: 'WO Actual' },
    { item_type: 'part', description: 'Valve cover gasket installed', quantity: 1, unit_price: 42, source_label: 'Installed Part' },
    { item_type: 'supply', description: 'Shop supplies', quantity: 1, unit_price: 15, source_label: 'Shop Rule' },
  ]
}

function previewSubtotal(sourceType: SourceType, workOrder: any, estimate: any, manualLines: any[]) {
  return previewLines(sourceType, workOrder, estimate, manualLines).reduce((sum, line) => sum + Number(line.quantity ?? 1) * Number(line.unit_price ?? 0), 0)
}
