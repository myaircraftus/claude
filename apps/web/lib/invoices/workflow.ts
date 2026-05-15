import type { NextRequest } from 'next/server'

export const INVOICE_STATUSES = new Set([
  'draft',
  'ready_to_send',
  'sent',
  'viewed',
  'due',
  'pending',
  'partially_paid',
  'paid',
  'overdue',
  'void',
  'refunded',
  'writeoff',
  'written_off',
])

export const INVOICE_LINE_TYPES = new Set([
  'labor',
  'part',
  'service',
  'outside_service',
  'supply',
  'tax',
  'fee',
  'discount',
  'adjustment',
  'deposit_credit',
])

export const PAYMENT_METHODS = new Set([
  'cash',
  'check',
  'credit_card',
  'card',
  'stripe',
  'wire',
  'ach',
  'zelle',
  'manual',
  'deposit_credit',
  'other',
])

export function normalizeInvoiceStatus(value: unknown, fallback = 'draft') {
  const normalized = String(value ?? fallback).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'writtenoff') return 'written_off'
  if (normalized === 'write_off') return 'writeoff'
  if (normalized === 'ready') return 'ready_to_send'
  return INVOICE_STATUSES.has(normalized) ? normalized : fallback
}

export function normalizeInvoiceLineType(value: unknown, fallback = 'service') {
  const normalized = String(value ?? fallback).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'outside') return 'outside_service'
  if (normalized === 'parts') return 'part'
  if (normalized === 'supplies') return 'supply'
  return INVOICE_LINE_TYPES.has(normalized) ? normalized : fallback
}

export function normalizePaymentMethod(value: unknown, fallback = 'other') {
  const normalized = String(value ?? fallback).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'creditcard') return 'credit_card'
  if (normalized === 'cc') return 'credit_card'
  return PAYMENT_METHODS.has(normalized) ? normalized : fallback
}

export function paymentStatusForTotals(total: number, paid: number, dueDate?: string | null) {
  if (paid >= total && total > 0) return { invoiceStatus: 'paid', paymentStatus: 'paid' }
  if (paid > 0) return { invoiceStatus: 'partially_paid', paymentStatus: 'partial' }
  if (dueDate && new Date(dueDate) < new Date()) return { invoiceStatus: 'overdue', paymentStatus: 'overdue' }
  return { invoiceStatus: 'due', paymentStatus: 'unpaid' }
}

export function paymentRequiresVerification(method: string) {
  return method === 'zelle'
}

export function sourceLabelForLine(line: Record<string, any>) {
  if (line.source_label) return line.source_label
  if (line.work_order_line_id || line.source_type === 'work_order_line') {
    if (line.line_type === 'labor' || line.item_type === 'labor') return 'WO Actual'
    if (line.line_type === 'part' || line.item_type === 'part') return 'Installed Part'
    if (line.line_type === 'outside_service' || line.item_type === 'outside_service') return 'Outside Service'
    if (line.line_type === 'supply' || line.item_type === 'supply') return 'Shop Rule'
    return 'Work Order'
  }
  if (line.source_type === 'estimate_line' || line.estimate_line_item_id) return 'Estimate Reference'
  if (line.source_type === 'manual') return 'Manual'
  return 'Manual'
}

export function calculateInvoiceTotals(input: {
  subtotal: number
  taxRate?: number | null
  taxAmount?: number | null
  discountAmount?: number | null
  feesTotal?: number | null
}) {
  const subtotal = Number(input.subtotal || 0)
  const taxRate = Number(input.taxRate || 0)
  const taxAmount = input.taxAmount == null
    ? Math.round(subtotal * taxRate) / 100
    : Number(input.taxAmount || 0)
  const discountAmount = Number(input.discountAmount || 0)
  const feesTotal = Number(input.feesTotal || 0)
  return {
    subtotal,
    tax_amount: taxAmount,
    discount_amount: discountAmount,
    fees_total: feesTotal,
    total: subtotal + taxAmount + feesTotal - discountAmount,
  }
}

export function requestIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
}

export async function writeInvoiceAudit(
  supabase: any,
  req: NextRequest,
  input: {
    organizationId: string
    userId: string
    action: string
    invoiceId: string
    aircraftId?: string | null
    metadata?: Record<string, unknown>
  }
) {
  await supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    action: input.action,
    entity_type: 'invoice',
    entity_id: input.invoiceId,
    ip_address: requestIp(req),
    user_agent: req.headers.get('user-agent'),
    metadata_json: {
      aircraft_id: input.aircraftId ?? null,
      ...(input.metadata ?? {}),
    },
  })

  await supabase.from('audit_events').insert({
    organization_id: input.organizationId,
    actor_id: input.userId,
    event_type: auditEventType(input.action),
    object_type: 'invoice',
    object_id: input.invoiceId,
    object_description: input.action,
    metadata: {
      aircraft_id: input.aircraftId ?? null,
      ...(input.metadata ?? {}),
    },
    ip_address: requestIp(req),
    user_agent: req.headers.get('user-agent'),
  })
}

export async function writeInvoiceTimeline(
  supabase: any,
  input: {
    organizationId: string
    aircraftId?: string | null
    actorId?: string | null
    action: string
    invoiceId: string
    title: string
    summary?: string | null
    ownerVisible?: boolean
    metadata?: Record<string, unknown>
  }
) {
  if (!input.aircraftId) return
  await supabase.from('aircraft_timeline_events').insert({
    organization_id: input.organizationId,
    aircraft_id: input.aircraftId,
    module: 'invoices',
    action: input.action,
    source_record_type: 'invoice',
    source_record_id: input.invoiceId,
    title: input.title,
    summary: input.summary ?? null,
    owner_visible: Boolean(input.ownerVisible),
    actor_id: input.actorId ?? null,
    metadata: input.metadata ?? {},
  })
}

function auditEventType(action: string) {
  if (action.includes('payment')) return 'payment'
  if (action.includes('send') || action.includes('email')) return 'email'
  if (action.includes('share')) return 'share'
  if (action.includes('sign')) return 'sign'
  if (action.includes('export') || action.includes('pdf') || action.includes('print')) return 'export'
  if (action.includes('status') || action.includes('void') || action.includes('paid')) return 'status_change'
  if (action.includes('delete')) return 'delete'
  if (action.includes('update') || action.includes('edit')) return 'update'
  return 'create'
}
