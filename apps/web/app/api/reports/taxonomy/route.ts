import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { fetchAtaChapters, fetchJascCodes } from '@/lib/taxonomy/queries'
import { formatTaxonomyLabel } from '@/lib/taxonomy/format'

interface Bucket {
  ata_code: string | null
  jasc_code: string | null
  ata_title?: string | null
  jasc_title?: string | null
  labor_hours: number
  labor_cost: number
  parts_cost: number
  estimate_amount: number
  invoice_amount: number
  open_work_count: number
  repeat_squawk_count: number
  due_soon_count: number
  overdue_count: number
  logbook_count: number
}

function key(ataCode?: string | null, jascCode?: string | null) {
  return `${ataCode ?? 'unclassified'}:${jascCode ?? ''}`
}

function numeric(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function getBucket(
  buckets: Map<string, Bucket>,
  ataCode?: string | null,
  jascCode?: string | null,
) {
  const bucketKey = key(ataCode, jascCode)
  let bucket = buckets.get(bucketKey)
  if (!bucket) {
    bucket = {
      ata_code: ataCode ?? null,
      jasc_code: jascCode ?? null,
      labor_hours: 0,
      labor_cost: 0,
      parts_cost: 0,
      estimate_amount: 0,
      invoice_amount: 0,
      open_work_count: 0,
      repeat_squawk_count: 0,
      due_soon_count: 0,
      overdue_count: 0,
      logbook_count: 0,
    }
    buckets.set(bucketKey, bucket)
  }
  return bucket
}

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const aircraftId = searchParams.get('aircraft_id')

  try {
    const supabase = createServerSupabase()
    const [ataRows, jascRows] = await Promise.all([
      fetchAtaChapters(supabase),
      fetchJascCodes(supabase, { limit: 1000 }),
    ])
    const ataByCode = new Map(ataRows.map((row) => [row.ata_code, row]))
    const jascByCode = new Map(jascRows.map((row) => [row.jasc_code, row]))
    const buckets = new Map<string, Bucket>()

    let workOrderLines = supabase
      .from('work_order_lines')
      .select('ata_code, jasc_code, line_type, line_total, hours, work_orders!inner(aircraft_id)')
      .eq('organization_id', ctx.organizationId)
      .not('ata_code', 'is', null)
      .limit(5000)
    if (aircraftId) workOrderLines = workOrderLines.eq('work_orders.aircraft_id', aircraftId)

    let estimateLines = supabase
      .from('estimate_line_items')
      .select('ata_code, jasc_code, item_type, line_total, hours, estimates!inner(aircraft_id)')
      .eq('organization_id', ctx.organizationId)
      .not('ata_code', 'is', null)
      .limit(5000)
    if (aircraftId) estimateLines = estimateLines.eq('estimates.aircraft_id', aircraftId)

    let invoiceLines = supabase
      .from('invoice_line_items')
      .select('ata_code, jasc_code, item_type, line_total, invoices!inner(aircraft_id)')
      .eq('organization_id', ctx.organizationId)
      .not('ata_code', 'is', null)
      .limit(5000)
    if (aircraftId) invoiceLines = invoiceLines.eq('invoices.aircraft_id', aircraftId)

    let workOrders = supabase
      .from('work_orders')
      .select('primary_ata_code, primary_jasc_code, status, aircraft_id')
      .eq('organization_id', ctx.organizationId)
      .not('primary_ata_code', 'is', null)
      .limit(5000)
    if (aircraftId) workOrders = workOrders.eq('aircraft_id', aircraftId)

    let squawks = supabase
      .from('squawks')
      .select('confirmed_ata_code, confirmed_jasc_code, status, aircraft_id')
      .eq('organization_id', ctx.organizationId)
      .not('confirmed_ata_code', 'is', null)
      .limit(5000)
    if (aircraftId) squawks = squawks.eq('aircraft_id', aircraftId)

    let compliance = supabase
      .from('compliance_items')
      .select('ata_code, jasc_code, status, aircraft_id')
      .eq('organization_id', ctx.organizationId)
      .not('ata_code', 'is', null)
      .limit(5000)
    if (aircraftId) compliance = compliance.eq('aircraft_id', aircraftId)

    let logbook = supabase
      .from('logbook_entries')
      .select('ata_code, jasc_code, aircraft_id')
      .eq('organization_id', ctx.organizationId)
      .not('ata_code', 'is', null)
      .limit(5000)
    if (aircraftId) logbook = logbook.eq('aircraft_id', aircraftId)

    const [
      workOrderLineResult,
      estimateLineResult,
      invoiceLineResult,
      workOrderResult,
      squawkResult,
      complianceResult,
      logbookResult,
    ] = await Promise.all([
      workOrderLines,
      estimateLines,
      invoiceLines,
      workOrders,
      squawks,
      compliance,
      logbook,
    ])

    for (const result of [
      workOrderLineResult,
      estimateLineResult,
      invoiceLineResult,
      workOrderResult,
      squawkResult,
      complianceResult,
      logbookResult,
    ]) {
      if (result.error) throw new Error(result.error.message)
    }

    for (const line of workOrderLineResult.data ?? []) {
      const bucket = getBucket(buckets, line.ata_code, line.jasc_code)
      if (line.line_type === 'labor') {
        bucket.labor_hours += numeric(line.hours)
        bucket.labor_cost += numeric(line.line_total)
      } else if (line.line_type === 'part') {
        bucket.parts_cost += numeric(line.line_total)
      }
    }

    for (const line of estimateLineResult.data ?? []) {
      getBucket(buckets, line.ata_code, line.jasc_code).estimate_amount += numeric(line.line_total)
    }

    for (const line of invoiceLineResult.data ?? []) {
      getBucket(buckets, line.ata_code, line.jasc_code).invoice_amount += numeric(line.line_total)
    }

    for (const row of workOrderResult.data ?? []) {
      const bucket = getBucket(buckets, row.primary_ata_code, row.primary_jasc_code)
      if (!['closed', 'paid', 'archived'].includes(row.status)) bucket.open_work_count += 1
    }

    for (const row of squawkResult.data ?? []) {
      const bucket = getBucket(buckets, row.confirmed_ata_code, row.confirmed_jasc_code)
      if (row.status !== 'resolved') bucket.repeat_squawk_count += 1
    }

    for (const row of complianceResult.data ?? []) {
      const bucket = getBucket(buckets, row.ata_code, row.jasc_code)
      if (row.status === 'due-soon') bucket.due_soon_count += 1
      if (row.status === 'overdue') bucket.overdue_count += 1
    }

    for (const row of logbookResult.data ?? []) {
      getBucket(buckets, row.ata_code, row.jasc_code).logbook_count += 1
    }

    const rows = Array.from(buckets.values()).map((bucket) => {
      const ata = bucket.ata_code ? ataByCode.get(bucket.ata_code) : null
      const jasc = bucket.jasc_code ? jascByCode.get(bucket.jasc_code) : null
      const formatted = formatTaxonomyLabel({
        ata_code: bucket.ata_code,
        ata_title: ata?.title ?? null,
        jasc_code: bucket.jasc_code,
        jasc_title: jasc?.title ?? null,
      })
      return {
        ...bucket,
        ata_title: ata?.title ?? null,
        jasc_title: jasc?.title ?? null,
        label: formatted.label,
        secondary_label: formatted.secondary,
      }
    }).sort((a, b) => (
      b.open_work_count - a.open_work_count ||
      b.overdue_count - a.overdue_count ||
      (a.ata_code ?? '').localeCompare(b.ata_code ?? '') ||
      (a.jasc_code ?? '').localeCompare(b.jasc_code ?? '')
    ))

    return NextResponse.json({ aircraft_id: aircraftId, rows })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build taxonomy report' },
      { status: 500 },
    )
  }
}
