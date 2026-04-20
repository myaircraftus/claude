'use client'

import { useState } from 'react'
import Link, { useTenantRouter } from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn, formatDate } from '@/lib/utils'
import {
  Send, Download, DollarSign, Ban, CheckCircle2,
  Plus, Trash2, Loader2, X, Save, Plane, FileText,
  CreditCard, Banknote, Building2, ArrowRight, ClipboardList,
} from 'lucide-react'

type InvoiceStatus = 'draft' | 'sent' | 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'writeoff'

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  partially_paid: 'bg-orange-50 text-orange-700 border-orange-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  void: 'bg-slate-50 text-slate-500 border-slate-200',
  writeoff: 'bg-slate-50 text-slate-500 border-slate-200',
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  pending: 'Pending',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
  writeoff: 'Write-off',
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  labor: 'Labor',
  part: 'Part',
  service: 'Service',
  outside_service: 'Outside Service',
  fee: 'Fee',
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'wire', label: 'Wire Transfer' },
  { value: 'ach', label: 'ACH' },
  { value: 'other', label: 'Other' },
]

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

interface Props {
  initialInvoice: any
}

export function InvoiceDetail({ initialInvoice }: Props) {
  const router = useTenantRouter()
  const [invoice, setInvoice] = useState(initialInvoice)
  const [lineItems, setLineItems] = useState<any[]>(initialInvoice.line_items ?? [])
  const [saving, setSaving] = useState(false)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [showAddLine, setShowAddLine] = useState(false)

  // Editable fields
  const [taxRate, setTaxRate] = useState(String(invoice.tax_rate ?? 0))
  const [discountAmount, setDiscountAmount] = useState(String(invoice.discount_amount ?? 0))
  const [notes, setNotes] = useState(invoice.notes ?? '')
  const [internalNotes, setInternalNotes] = useState(invoice.internal_notes ?? '')
  const [paymentTerms, setPaymentTerms] = useState(invoice.payment_terms ?? 'Net 30')
  const [dirty, setDirty] = useState(false)

  // New line form
  const [newLine, setNewLine] = useState({
    description: '',
    quantity: '1',
    unit_price: '0',
    item_type: 'service',
  })

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentRef, setPaymentRef] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [recordingPayment, setRecordingPayment] = useState(false)

  // Email form
  const [emailTo, setEmailTo] = useState(invoice.customer?.email ?? '')
  const [sendingEmail, setSendingEmail] = useState(false)

  const customer = invoice.customer as any
  const aircraft = invoice.aircraft as any
  const workOrder = invoice.work_order as any
  const payments: any[] = []
  const isEditable = invoice.status === 'draft' || invoice.status === 'sent'

  function markDirty() { setDirty(true) }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tax_rate: parseFloat(taxRate) || 0,
          discount_amount: parseFloat(discountAmount) || 0,
          notes,
          internal_notes: internalNotes,
          payment_terms: paymentTerms,
        }),
      })
      const data = await res.json()
      setInvoice((prev: any) => ({ ...prev, ...data }))
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddLine(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`/api/invoices/${invoice.id}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: newLine.description,
        quantity: parseFloat(newLine.quantity) || 1,
        unit_price: parseFloat(newLine.unit_price) || 0,
        item_type: newLine.item_type,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      setLineItems(prev => [...prev, data])
      setNewLine({ description: '', quantity: '1', unit_price: '0', item_type: 'service' })
      setShowAddLine(false)
      refreshInvoice()
    }
  }

  async function handleUpdateLine(lineId: string, updates: any) {
    const res = await fetch(`/api/invoices/${invoice.id}/lines/${lineId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      const data = await res.json()
      setLineItems(prev => prev.map(li => li.id === lineId ? data : li))
      refreshInvoice()
    }
  }

  async function handleDeleteLine(lineId: string) {
    if (!confirm('Remove this line item?')) return
    const res = await fetch(`/api/invoices/${invoice.id}/lines/${lineId}`, { method: 'DELETE' })
    if (res.ok) {
      setLineItems(prev => prev.filter(li => li.id !== lineId))
      refreshInvoice()
    }
  }

  async function refreshInvoice() {
    const res = await fetch(`/api/invoices/${invoice.id}`)
    if (res.ok) {
      const data = await res.json()
      setInvoice(data)
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault()
    setRecordingPayment(true)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(paymentAmount),
          payment_method: paymentMethod,
          reference_number: paymentRef || undefined,
          notes: paymentNotes || undefined,
        }),
      })
      if (res.ok) {
        setShowPaymentDialog(false)
        setPaymentAmount('')
        setPaymentRef('')
        setPaymentNotes('')
        refreshInvoice()
        router.refresh()
      }
    } finally {
      setRecordingPayment(false)
    }
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault()
    setSendingEmail(true)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_email: emailTo }),
      })
      if (res.ok) {
        setShowEmailDialog(false)
        refreshInvoice()
        router.refresh()
      } else {
        const err = await res.json()
        alert(err.error ?? 'Failed to send email')
      }
    } finally {
      setSendingEmail(false)
    }
  }

  async function handleMarkPaid() {
    if (!confirm('Mark this invoice as fully paid?')) return
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    })
    if (res.ok) {
      refreshInvoice()
      router.refresh()
    }
  }

  async function handleVoid() {
    if (!confirm('Void this invoice? This cannot be undone.')) return
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'void' }),
    })
    if (res.ok) {
      refreshInvoice()
      router.refresh()
    }
  }

  const subtotal = lineItems.reduce((sum: number, li: any) => sum + ((li.line_total ?? li.quantity * li.unit_price) || 0), 0)
  const computedTax = Math.round(subtotal * (parseFloat(taxRate) || 0)) / 100
  const computedTotal = subtotal + computedTax - (parseFloat(discountAmount) || 0)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono text-foreground">
                {invoice.invoice_number ?? 'Invoice'}
              </h1>
              <span className={cn(
                'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
                STATUS_COLOR[invoice.status as InvoiceStatus] ?? STATUS_COLOR.draft
              )}>
                {STATUS_LABEL[invoice.status as InvoiceStatus] ?? invoice.status}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              {customer && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {customer.name}
                </span>
              )}
              {aircraft && (
                <span className="flex items-center gap-1">
                  <Plane className="h-3.5 w-3.5" />
                  {aircraft.tail_number}
                </span>
              )}
              {workOrder && (
                <Link href={`/work-orders/${workOrder.id}`} className="flex items-center gap-1 text-brand-600 hover:underline">
                  <ClipboardList className="h-3.5 w-3.5" />
                  {workOrder.work_order_number}
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowEmailDialog(true)}>
            <Send className="h-3.5 w-3.5 mr-1" />
            Send Email
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Download className="h-3.5 w-3.5 mr-1" />
              Download PDF
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowPaymentDialog(true)} disabled={invoice.status === 'paid' || invoice.status === 'void'}>
            <DollarSign className="h-3.5 w-3.5 mr-1" />
            Record Payment
          </Button>
          {invoice.status !== 'paid' && invoice.status !== 'void' && (
            <Button size="sm" variant="outline" onClick={handleMarkPaid}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Mark Paid
            </Button>
          )}
          {invoice.status !== 'void' && (
            <Button size="sm" variant="outline" onClick={handleVoid} className="text-destructive hover:text-destructive">
              <Ban className="h-3.5 w-3.5 mr-1" />
              Void
            </Button>
          )}
        </div>

        {/* Dates row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border border-border bg-card">
            <p className="text-xs text-muted-foreground">Issue Date</p>
            <p className="text-sm font-medium text-foreground mt-0.5">{invoice.invoice_date ? formatDate(invoice.invoice_date) : '--'}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-card">
            <p className="text-xs text-muted-foreground">Due Date</p>
            <p className={cn('text-sm font-medium mt-0.5', invoice.due_date && new Date(invoice.due_date) < new Date() && invoice.status !== 'paid' ? 'text-red-600' : 'text-foreground')}>
              {invoice.due_date ? formatDate(invoice.due_date) : '--'}
            </p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-card">
            <p className="text-xs text-muted-foreground">Payment Terms</p>
            {isEditable ? (
              <input
                value={paymentTerms}
                onChange={e => { setPaymentTerms(e.target.value); markDirty() }}
                className="w-full text-sm font-medium text-foreground mt-0.5 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
              />
            ) : (
              <p className="text-sm font-medium text-foreground mt-0.5">{paymentTerms}</p>
            )}
          </div>
          <div className="p-3 rounded-lg border border-border bg-card">
            <p className="text-xs text-muted-foreground">Sent</p>
            <p className="text-sm font-medium text-foreground mt-0.5">
              {invoice.email_sent_at ? formatDate(invoice.email_sent_at) : 'Not yet'}
            </p>
          </div>
        </div>

        {/* Line Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Line Items</h2>
            {isEditable && (
              <Button size="sm" variant="outline" onClick={() => setShowAddLine(v => !v)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Item
              </Button>
            )}
          </div>

          {/* Add line form */}
          {showAddLine && (
            <form onSubmit={handleAddLine} className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Type</Label>
                  <select
                    value={newLine.item_type}
                    onChange={e => setNewLine(v => ({ ...v, item_type: e.target.value }))}
                    className="w-full mt-1 h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {Object.entries(ITEM_TYPE_LABEL).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <Label className="text-xs">Description *</Label>
                  <Input
                    value={newLine.description}
                    onChange={e => setNewLine(v => ({ ...v, description: e.target.value }))}
                    placeholder="Description"
                    className="mt-1 h-8 text-xs"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newLine.quantity}
                    onChange={e => setNewLine(v => ({ ...v, quantity: e.target.value }))}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Unit Price</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newLine.unit_price}
                    onChange={e => setNewLine(v => ({ ...v, unit_price: e.target.value }))}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowAddLine(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={!newLine.description}>Add</Button>
              </div>
            </form>
          )}

          {lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
              No line items yet.
            </p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Description</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wide">Qty</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wide">Rate</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
                    {isEditable && <th className="px-3 py-2 w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {lineItems.map((li: any) => (
                    <LineItemRow
                      key={li.id}
                      item={li}
                      editable={isEditable}
                      onUpdate={(updates) => handleUpdateLine(li.id, updates)}
                      onDelete={() => handleDeleteLine(li.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Tax Rate (%)</span>
                {isEditable ? (
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={taxRate}
                    onChange={e => { setTaxRate(e.target.value); markDirty() }}
                    className="w-16 h-6 px-1 text-right text-xs rounded border border-input bg-background tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                ) : (
                  <span className="tabular-nums text-xs">{taxRate}%</span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">{formatCurrency(computedTax)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Discount</span>
                {isEditable ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discountAmount}
                      onChange={e => { setDiscountAmount(e.target.value); markDirty() }}
                      className="w-20 h-6 px-1 text-right text-xs rounded border border-input bg-background tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                ) : (
                  <span className="tabular-nums">{formatCurrency(parseFloat(discountAmount) || 0)}</span>
                )}
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 font-bold text-base">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(computedTotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Amount Paid</span>
                <span className="tabular-nums">{formatCurrency(invoice.amount_paid ?? 0)}</span>
              </div>
              <div className="flex justify-between font-bold text-brand-700">
                <span>Balance Due</span>
                <span className="tabular-nums">{formatCurrency(invoice.balance_due ?? computedTotal - (invoice.amount_paid ?? 0))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payments history */}
        {payments.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Payments</h2>
            <div className="space-y-2">
              {payments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.payment_method?.replace('_', ' ')} {p.reference_number ? `- ${p.reference_number}` : ''}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(p.payment_date ?? p.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Notes (visible on invoice)</Label>
            <textarea
              value={notes}
              onChange={e => { setNotes(e.target.value); markDirty() }}
              readOnly={!isEditable}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Notes for the customer..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Internal Notes</Label>
            <textarea
              value={internalNotes}
              onChange={e => { setInternalNotes(e.target.value); markDirty() }}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Internal notes (not on invoice)..."
            />
          </div>
        </div>

        {/* Metadata */}
        <div className="text-xs text-muted-foreground flex flex-wrap gap-4 pt-2 border-t border-border">
          <span>Created: {formatDate(invoice.created_at)}</span>
          {invoice.sent_at && <span>Sent: {formatDate(invoice.sent_at)}</span>}
          {invoice.paid_at && <span>Paid: {formatDate(invoice.paid_at)}</span>}
          {invoice.voided_at && <span>Voided: {formatDate(invoice.voided_at)}</span>}
          {invoice.email_sent_to && <span>Emailed to: {invoice.email_sent_to}</span>}
        </div>

        {/* Save bar */}
        {dirty && (
          <div className="fixed bottom-6 right-6 z-40">
            <Button onClick={handleSave} disabled={saving} className="shadow-lg">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        )}

        {/* Record Payment Dialog */}
        {showPaymentDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPaymentDialog(false)}>
            <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-foreground">Record Payment</h3>
                <button onClick={() => setShowPaymentDialog(false)} className="p-1 rounded text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleRecordPayment} className="space-y-3">
                <div>
                  <Label className="text-xs">Amount *</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    placeholder={formatCurrency(invoice.balance_due ?? 0)}
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">Method</Label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full mt-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {PAYMENT_METHODS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Reference #</Label>
                  <Input
                    value={paymentRef}
                    onChange={e => setPaymentRef(e.target.value)}
                    placeholder="Check number, transaction ID, etc."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input
                    value={paymentNotes}
                    onChange={e => setPaymentNotes(e.target.value)}
                    placeholder="Optional notes"
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
                  <Button type="submit" disabled={recordingPayment || !paymentAmount}>
                    {recordingPayment ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <DollarSign className="h-4 w-4 mr-1" />}
                    Record
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Send Email Dialog */}
        {showEmailDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEmailDialog(false)}>
            <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-foreground">Send Invoice</h3>
                <button onClick={() => setShowEmailDialog(false)} className="p-1 rounded text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleSendEmail} className="space-y-3">
                <div>
                  <Label className="text-xs">Recipient Email *</Label>
                  <Input
                    type="email"
                    value={emailTo}
                    onChange={e => setEmailTo(e.target.value)}
                    placeholder="customer@email.com"
                    className="mt-1"
                    required
                  />
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <p>This will send an HTML email with:</p>
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    <li>Invoice #{invoice.invoice_number}</li>
                    <li>{lineItems.length} line items</li>
                    <li>Total: {formatCurrency(invoice.total ?? 0)}</li>
                    {invoice.stripe_payment_link_url && <li>Pay Now link included</li>}
                  </ul>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowEmailDialog(false)}>Cancel</Button>
                  <Button type="submit" disabled={sendingEmail || !emailTo}>
                    {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                    Send
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Editable Line Item Row ──────────────────────────────────────────────────

function LineItemRow({
  item,
  editable,
  onUpdate,
  onDelete,
}: {
  item: any
  editable: boolean
  onUpdate: (updates: any) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [desc, setDesc] = useState(item.description)
  const [qty, setQty] = useState(String(item.quantity))
  const [price, setPrice] = useState(String(item.unit_price))

  function handleSave() {
    onUpdate({
      description: desc,
      quantity: parseFloat(qty) || 1,
      unit_price: parseFloat(price) || 0,
    })
    setEditing(false)
  }

  const lineTotal = item.line_total ?? (item.quantity * item.unit_price)

  return (
    <tr className="hover:bg-muted/20">
      <td className="px-3 py-2 text-muted-foreground">
        {ITEM_TYPE_LABEL[item.item_type] ?? item.item_type}
      </td>
      <td className="px-3 py-2 max-w-xs">
        {editing ? (
          <input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            className="w-full px-1 py-0.5 rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            onBlur={handleSave}
          />
        ) : (
          <p
            className={cn('text-foreground', editable && 'cursor-pointer hover:text-brand-600')}
            onClick={() => editable && setEditing(true)}
          >
            {item.description}
          </p>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        {editing ? (
          <input
            type="number"
            value={qty}
            onChange={e => setQty(e.target.value)}
            className="w-14 px-1 py-0.5 text-right rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            onBlur={handleSave}
          />
        ) : (
          <span
            className={editable ? 'cursor-pointer hover:text-brand-600' : undefined}
            onClick={() => editable && setEditing(true)}
          >
            {item.quantity}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        {editing ? (
          <input
            type="number"
            value={price}
            onChange={e => setPrice(e.target.value)}
            className="w-20 px-1 py-0.5 text-right rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            onBlur={handleSave}
          />
        ) : (
          <span
            className={editable ? 'cursor-pointer hover:text-brand-600' : undefined}
            onClick={() => editable && setEditing(true)}
          >
            ${(item.unit_price ?? 0).toFixed(2)}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
        ${lineTotal.toFixed(2)}
      </td>
      {editable && (
        <td className="px-3 py-2">
          <button
            onClick={onDelete}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  )
}
