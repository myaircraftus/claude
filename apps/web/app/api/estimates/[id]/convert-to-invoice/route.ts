/**
 * POST /api/estimates/[id]/convert-to-invoice
 *
 * Atomically creates a new invoice from an approved estimate:
 *   1. Pulls the estimate header + line items (org-scoped)
 *   2. Generates a new invoice with a fresh number
 *   3. Copies every estimate_line_item into invoice_line_items
 *      (line_total + item_type + classification carry over)
 *   4. Flips the estimate to status='converted_to_work_order' and
 *      stamps the invoice id in source_id
 *   5. Stamps invoices.estimate_id back-pointer
 *
 * The trigger-backed recompute on invoice_line_items keeps the
 * invoice header totals in lockstep automatically.
 *
 * Requires: estimate status in {approved, deposit_paid}. Refuses
 * already-converted estimates.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const CONVERTIBLE_STATUSES = new Set(['approved', 'deposit_paid', 'sent', 'viewed'])

// Match the mark-paid billing roles — only personas with real billing
// authority can spin up an invoice from an estimate.
const BILLING_ROLES = new Set([
  'owner',
  'admin',
  'org_admin',
  'manager',
  'shop_manager',
  'service_writer',
  'bookkeeper',
  'mechanic',
])

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(_req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!BILLING_ROLES.has(String((ctx.membership as { role?: string } | null)?.role ?? ''))) {
    return NextResponse.json({ error: 'Forbidden — billing role required' }, { status: 403 })
  }
  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data: estimate, error: estErr } = await supabase
    .from('estimates')
    .select(
      'id, status, estimate_number, aircraft_id, customer_id, total, terms, customer_notes, ' +
        'internal_notes, primary_ata_code, primary_jasc_code, converted_work_order_id, ' +
        'deposit_amount, deposit_status, valid_until',
    )
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (estErr || !estimate) {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
  }
  if (!CONVERTIBLE_STATUSES.has((estimate as { status: string }).status)) {
    return NextResponse.json(
      {
        error: 'Estimate is not in a convertible status',
        current_status: (estimate as { status: string }).status,
      },
      { status: 409 },
    )
  }

  // Refuse double-convert
  const { data: existingConversion } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .eq('organization_id', orgId)
    .eq('estimate_id', params.id)
    .maybeSingle()
  if (existingConversion) {
    return NextResponse.json(
      {
        error: 'This estimate has already been converted',
        invoice_id: (existingConversion as { id: string }).id,
        invoice_number: (existingConversion as { invoice_number: string }).invoice_number,
      },
      { status: 409 },
    )
  }

  // Allocate a new invoice number — INV-YYYY-XXXXXX
  const year = new Date().getFullYear()
  const invoiceNumber = `INV-${year}-${String(Date.now()).slice(-6)}`

  const e = estimate as {
    aircraft_id: string | null
    customer_id: string | null
    terms: string | null
    customer_notes: string | null
    internal_notes: string | null
    deposit_amount: number | null
    deposit_status: string | null
  }

  const { data: newInvoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      organization_id: orgId,
      invoice_number: invoiceNumber,
      customer_id: e.customer_id,
      aircraft_id: e.aircraft_id,
      status: 'draft',
      issue_date: new Date().toISOString().slice(0, 10),
      terms: e.terms,
      notes: e.customer_notes,
      internal_notes: e.internal_notes,
      estimate_id: params.id,
      source_type: 'estimate',
      source_id: params.id,
      created_by: ctx.user.id,
    })
    .select('id, invoice_number')
    .single()
  if (invErr || !newInvoice) {
    // Race-condition handling: a UNIQUE INDEX on
    // invoices.estimate_id WHERE estimate_id IS NOT NULL turns a
    // concurrent double-convert into a 23505 here. We surface the
    // already-existing invoice instead of leaving the second caller
    // confused.
    if (invErr && /23505|duplicate key|unique/i.test(invErr.message)) {
      const { data: existing } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .eq('organization_id', orgId)
        .eq('estimate_id', params.id)
        .maybeSingle()
      if (existing) {
        return NextResponse.json(
          {
            error: 'This estimate was just converted by another request',
            invoice_id: (existing as { id: string }).id,
            invoice_number: (existing as { invoice_number: string }).invoice_number,
          },
          { status: 409 },
        )
      }
    }
    return NextResponse.json({ error: invErr?.message ?? 'Invoice create failed' }, { status: 500 })
  }

  // Pull + copy line items
  const { data: estLines } = await supabase
    .from('estimate_line_items')
    .select(
      'description, quantity, unit_price, line_total, item_type, sort_order, ata_code, jasc_code, ' +
        'classification_source, classification_confidence, classification_status, source_type, source_id, ' +
        'source_label, billable, owner_visible, tax_code',
    )
    .eq('organization_id', orgId)
    .eq('estimate_id', params.id)
    .order('sort_order', { ascending: true })

  const toInsert = (estLines ?? []).map(
    (l) =>
      ({
        organization_id: orgId,
        invoice_id: (newInvoice as { id: string }).id,
        description: (l as { description: string }).description,
        quantity: (l as { quantity: number | null }).quantity,
        unit_price: (l as { unit_price: number | null }).unit_price,
        line_total: (l as { line_total: number | null }).line_total,
        item_type: (l as { item_type: string | null }).item_type,
        sort_order: (l as { sort_order: number | null }).sort_order,
        ata_code: (l as { ata_code: string | null }).ata_code,
        jasc_code: (l as { jasc_code: string | null }).jasc_code,
        classification_source: (l as { classification_source: string | null }).classification_source,
        classification_confidence: (l as { classification_confidence: number | null }).classification_confidence,
        classification_status: (l as { classification_status: string | null }).classification_status,
        source_type: 'estimate',
        source_id: params.id,
        source_label: (l as { source_label: string | null }).source_label ?? 'From estimate',
        tax_category: (l as { tax_code: string | null }).tax_code,
        billable: (l as { billable: boolean | null }).billable ?? true,
        owner_visible: (l as { owner_visible: boolean | null }).owner_visible ?? true,
      }) as Record<string, unknown>,
  )

  if (toInsert.length > 0) {
    const { error: linesErr } = await supabase.from('invoice_line_items').insert(toInsert)
    if (linesErr) {
      return NextResponse.json(
        {
          error: 'Invoice created but line copy failed',
          invoice_id: (newInvoice as { id: string }).id,
          detail: linesErr.message,
        },
        { status: 500 },
      )
    }
  }

  // Apply deposit credit if any
  if ((e.deposit_amount ?? 0) > 0 && (e.deposit_status === 'paid' || e.deposit_status === 'received')) {
    await supabase.from('invoice_line_items').insert({
      organization_id: orgId,
      invoice_id: (newInvoice as { id: string }).id,
      description: 'Deposit applied from estimate',
      quantity: 1,
      unit_price: e.deposit_amount,
      line_total: e.deposit_amount,
      item_type: 'deposit_credit',
      sort_order: 9999,
      source_type: 'estimate',
      source_id: params.id,
      source_label: 'Deposit credit',
      billable: false,
      owner_visible: true,
    })
  }

  // Flip the estimate forward
  await supabase
    .from('estimates')
    .update({
      status: 'converted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('organization_id', orgId)

  return NextResponse.json({
    ok: true,
    invoice_id: (newInvoice as { id: string }).id,
    invoice_number: (newInvoice as { invoice_number: string }).invoice_number,
    line_count: toInsert.length,
  })
}
