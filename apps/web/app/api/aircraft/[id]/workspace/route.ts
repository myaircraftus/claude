import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentPersona } from '@/lib/persona/server'
import { applyOwnerLogbookVisibility } from '@/lib/logbook/visibility'

function countBy(rows: Array<Record<string, any>>, field: string) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = String(row[field] ?? 'unknown')
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
}

async function attachTaxonomyLabels(
  supabase: ReturnType<typeof createServerSupabase>,
  rows: Array<Record<string, any>>,
) {
  const ataCodes = Array.from(new Set(rows.map((row) => row.ata_code).filter(Boolean)))
  const jascCodes = Array.from(new Set(rows.map((row) => row.jasc_code).filter(Boolean)))

  const [ataRes, jascRes] = await Promise.all([
    ataCodes.length
      ? supabase.from('ata_chapters').select('ata_code, title').in('ata_code', ataCodes)
      : Promise.resolve({ data: [] }),
    jascCodes.length
      ? supabase.from('jasc_codes').select('jasc_code, title').in('jasc_code', jascCodes)
      : Promise.resolve({ data: [] }),
  ])

  const ataByCode = new Map((ataRes.data ?? []).map((row: any) => [row.ata_code, row]))
  const jascByCode = new Map((jascRes.data ?? []).map((row: any) => [row.jasc_code, row]))

  return rows.map((row) => ({
    ...row,
    ata: row.ata_code ? ataByCode.get(row.ata_code) ?? null : null,
    jasc: row.jasc_code ? jascByCode.get(row.jasc_code) ?? null : null,
  }))
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Owner-visibility gate for the logbook tab — owners see only published/own
  // entries (the logbook_select RLS policy enforces the same rule).
  let persona = 'shop'
  try {
    persona = (await getCurrentPersona()).persona
  } catch {
    // defensive — ctx already proved a session
  }

  const supabase = createServerSupabase()
  const { data: aircraft, error: aircraftError } = await supabase
    .from('aircraft')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .eq('is_archived', false)
    .maybeSingle()

  if (aircraftError) return NextResponse.json({ error: aircraftError.message }, { status: 500 })
  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

  const ownerId = aircraft.owner_customer_id as string | null
  const payerId = (aircraft.maintenance_payer_customer_id ?? aircraft.owner_customer_id) as string | null

  const [
    ownerRes,
    payerRes,
    mediaRes,
    timeSnapshotRes,
    dueRes,
    complianceRes,
    workOrdersRes,
    squawksRes,
    estimatesRes,
    invoicesRes,
    logbookRes,
    documentsRes,
    timelineRes,
    aiRes,
  ] = await Promise.all([
    ownerId
      ? supabase
          .from('customers')
          .select('id, name, company, email, phone')
          .eq('organization_id', ctx.organizationId)
          .eq('id', ownerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    payerId
      ? supabase
          .from('customers')
          .select('id, name, company, email, phone, billing_address')
          .eq('organization_id', ctx.organizationId)
          .eq('id', payerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('aircraft_media')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('aircraft_id', params.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('aircraft_time_snapshots')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('aircraft_id', params.id)
      .maybeSingle(),
    supabase
      .from('aircraft_due_items')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('aircraft_id', params.id)
      .is('deleted_at', null)
      .order('next_due_date', { ascending: true, nullsFirst: false })
      .limit(200),
    supabase
      .from('compliance_items')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('aircraft_id', params.id)
      .is('deleted_at', null)
      .order('next_due_date', { ascending: true, nullsFirst: false })
      .limit(100),
    supabase
      .from('work_orders')
      .select('id, work_order_number, status, service_type, complaint, total_amount, opened_at, closed_at, primary_ata_code, primary_jasc_code, classification_status')
      .eq('organization_id', ctx.organizationId)
      .eq('aircraft_id', params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('squawks')
      .select('id, title, description, severity, status, reported_at, assigned_work_order_id, suggested_ata_code, suggested_jasc_code, confirmed_ata_code, confirmed_jasc_code, classification_status')
      .eq('organization_id', ctx.organizationId)
      .eq('aircraft_id', params.id)
      .order('reported_at', { ascending: false })
      .limit(50),
    supabase
      .from('estimates')
      .select('id, estimate_number, status, service_type, total, valid_until, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('aircraft_id', params.id)
      .order('created_at', { ascending: false })
      .limit(25),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total, amount_paid, balance_due, issue_date, due_date, paid_at')
      .eq('organization_id', ctx.organizationId)
      .eq('aircraft_id', params.id)
      .order('created_at', { ascending: false })
      .limit(25),
    applyOwnerLogbookVisibility(
      supabase
        .from('logbook_entries')
        .select('id, entry_date, logbook_type, status, description, tach_time, total_time, ata_code, jasc_code, signed_at')
        .eq('organization_id', ctx.organizationId)
        .eq('aircraft_id', params.id),
      persona,
      ctx.user.id,
    )
      .order('entry_date', { ascending: false })
      .limit(25),
    supabase
      .from('documents')
      .select('id, title, file_name, doc_type, parsing_status, uploaded_at, document_date')
      .eq('organization_id', ctx.organizationId)
      .eq('aircraft_id', params.id)
      .order('uploaded_at', { ascending: false })
      .limit(25),
    supabase
      .from('aircraft_timeline_events')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('aircraft_id', params.id)
      .order('occurred_at', { ascending: false })
      .limit(50),
    supabase
      .from('ai_suggestions')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('aircraft_id', params.id)
      .order('created_at', { ascending: false })
      .limit(25),
  ])

  const dueItems = await attachTaxonomyLabels(supabase, (dueRes.data ?? []) as any[])
  const complianceItems = await attachTaxonomyLabels(supabase, (complianceRes.data ?? []) as any[])
  const logbookEntries = await attachTaxonomyLabels(supabase, (logbookRes.data ?? []) as any[])
  const workOrders = (workOrdersRes.data ?? []) as any[]
  const squawks = (squawksRes.data ?? []) as any[]
  const invoices = (invoicesRes.data ?? []) as any[]

  const openWorkOrders = workOrders.filter((row) => !['closed', 'invoiced', 'paid', 'archived'].includes(row.status))
  const openSquawks = squawks.filter((row) => !['resolved', 'deferred'].includes(row.status))
  const openInvoices = invoices.filter((row) => !['paid', 'void', 'writeoff'].includes(row.status))

  return NextResponse.json({
    aircraft,
    owner_customer: ownerRes.data ?? null,
    maintenance_payer: payerRes.data ?? null,
    media: mediaRes.data ?? [],
    time_snapshot: timeSnapshotRes.data ?? null,
    due_items: dueItems,
    compliance_items: complianceItems,
    work_orders: workOrders,
    squawks,
    estimates: estimatesRes.data ?? [],
    invoices,
    logbook_entries: logbookEntries,
    documents: documentsRes.data ?? [],
    timeline_events: timelineRes.data ?? [],
    ai_suggestions: aiRes.data ?? [],
    counts: {
      due_by_status: countBy(dueItems, 'status'),
      compliance_by_status: countBy(complianceItems, 'status'),
      work_orders_by_status: countBy(workOrders, 'status'),
      squawks_by_status: countBy(squawks, 'status'),
      open_work_orders: openWorkOrders.length,
      open_squawks: openSquawks.length,
      open_invoices: openInvoices.length,
      documents: documentsRes.data?.length ?? 0,
      ai_needs_review: (aiRes.data ?? []).filter((row: any) => ['suggested', 'draft', 'needs_review'].includes(row.status)).length,
    },
  })
}
