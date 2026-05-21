/**
 * GET /api/owner/export
 *
 * GDPR Article 20 — data portability. Returns a JSON dump of every
 * record the calling owner can see across their linked customer rows.
 * Scope is strictly owner-side: only data the owner already has read
 * access to via the existing Iron-Wall rules (SOP-14).
 *
 * Response is application/json with a Content-Disposition that prompts
 * a download. The UI button at /owner/settings/privacy → "Download my
 * data" hits this route directly.
 *
 * Audit: every export creates an `audit_event` row of kind='data_export'
 * with the requesting user id and the row counts so the privacy officer
 * can show evidence of compliance.
 */
import { NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()

  // Find the owner's customer rows.
  const { data: customers } = await service
    .from('customers')
    .select('id, organization_id, name, email, phone, portal_user_id, portal_access')
    .eq('portal_user_id', user.id)
    .eq('portal_access', true)

  if (!customers || customers.length === 0) {
    return NextResponse.json(
      { error: 'No portal access for this account.' },
      { status: 403 },
    )
  }

  const customerIds = (customers as Array<{ id: string }>).map((c) => c.id)

  // Aircraft they can see — owner_customer_id OR via assignment.
  const [primaryAircraftRes, assignmentRes] = await Promise.all([
    service
      .from('aircraft')
      .select(
        'id, tail_number, year, make, model, serial_number, total_time_hours, annual_due_date',
      )
      .in('owner_customer_id', customerIds),
    service
      .from('aircraft_customer_assignments')
      .select('aircraft_id, relationship')
      .in('customer_id', customerIds),
  ])

  const assignedIds = (assignmentRes.data ?? []).map(
    (r: { aircraft_id: string }) => r.aircraft_id,
  )
  let assignedAircraft: unknown[] = []
  if (assignedIds.length > 0) {
    const { data } = await service
      .from('aircraft')
      .select(
        'id, tail_number, year, make, model, serial_number, total_time_hours, annual_due_date',
      )
      .in('id', assignedIds)
    assignedAircraft = data ?? []
  }

  const aircraftById = new Map<string, unknown>()
  for (const a of (primaryAircraftRes.data ?? []) as Array<{ id: string }>) {
    aircraftById.set(a.id, a)
  }
  for (const a of assignedAircraft as Array<{ id: string }>) {
    aircraftById.set(a.id, a)
  }
  const aircraftList = Array.from(aircraftById.values())
  const aircraftIds = aircraftList.map((a) => (a as { id: string }).id)

  // Owner-visible content across the linked aircraft.
  const [logRes, estRes, invRes, woRes, threadRes] = await Promise.all([
    service
      .from('logbook_entries')
      .select(
        'id, aircraft_id, entry_date, total_time_hours, summary, status, signed_at',
      )
      .in('aircraft_id', aircraftIds.length > 0 ? aircraftIds : [''])
      .in('status', ['signed', 'published_to_owner']),
    service
      .from('estimates')
      .select('id, aircraft_id, estimate_number, status, total_cents, approved_at')
      .in('aircraft_id', aircraftIds.length > 0 ? aircraftIds : [''])
      .in('status', ['approved', 'awaiting_approval', 'declined']),
    service
      .from('invoices')
      .select('id, aircraft_id, invoice_number, status, total_cents, due_at')
      .in('aircraft_id', aircraftIds.length > 0 ? aircraftIds : [''])
      .not('status', 'in', '(draft,void)'),
    service
      .from('work_orders')
      .select('id, aircraft_id, wo_number, status, service_type, created_at, summary')
      .in('aircraft_id', aircraftIds.length > 0 ? aircraftIds : [''])
      .eq('owner_visible', true),
    service
      .from('portal_threads')
      .select('id, organization_id, customer_id, last_message_snippet, created_at')
      .in('customer_id', customerIds),
  ])

  const pkg = {
    export_generated_at: new Date().toISOString(),
    export_format_version: '1.0',
    export_recipient: {
      auth_user_id: user.id,
      email: user.email,
    },
    note:
      'This package contains every record myaircraft.us holds on you that you have read access to via your portal account. ' +
      'Internal mechanic notes, vendor cost basis, and other tenants\' data are NOT included by design — they were never available to you and remain off-limits.',
    customers,
    aircraft: aircraftList,
    logbook_entries: logRes.data ?? [],
    estimates: estRes.data ?? [],
    invoices: invRes.data ?? [],
    work_orders: woRes.data ?? [],
    portal_threads: threadRes.data ?? [],
  }

  // Audit log (best-effort — don't block the export on write failure).
  try {
    await service.from('audit_event').insert({
      organization_id:
        (customers as Array<{ organization_id: string }>)[0]?.organization_id ?? null,
      actor_user_id: user.id,
      kind: 'data_export',
      target_kind: 'owner_account',
      target_id: user.id,
      payload: {
        counts: {
          customers: customers.length,
          aircraft: aircraftList.length,
          logbook_entries: (logRes.data ?? []).length,
          estimates: (estRes.data ?? []).length,
          invoices: (invRes.data ?? []).length,
          work_orders: (woRes.data ?? []).length,
          portal_threads: (threadRes.data ?? []).length,
        },
      },
    })
  } catch (err) {
    console.warn('[api/owner/export] audit write failed (ignored):', err)
  }

  const filename = `myaircraft-data-export-${new Date()
    .toISOString()
    .slice(0, 10)}.json`

  return new NextResponse(JSON.stringify(pkg, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
