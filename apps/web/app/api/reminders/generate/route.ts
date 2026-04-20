import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getOperationTypeLabels, isForHireOperation } from '@/lib/aircraft/operations'

interface StandardReminder {
  reminder_type: string
  title: string
  description: string
  priority: string
  due_date?: string
  due_hours?: number
  current_hours?: number
  hours_remaining?: number
  activation_state: 'canonical' | 'informational_only' | 'review_required' | 'ignore'
  activation_block_reason?: string | null
  evidence_document_id?: string | null
  evidence_segment_id?: string | null
  canonical_record_version_id?: string | null
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

function isCanonicalMaintenanceEvent(event: any) {
  if (!event) return false
  if (event.truth_state === 'canonical') return true
  if (event.canonicalization_status === 'canonical') return true
  return event.truth_state === 'legacy' && Boolean(event.is_verified)
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { aircraft_id } = body

  if (!aircraft_id) {
    return NextResponse.json({ error: 'aircraft_id required' }, { status: 400 })
  }

  // Verify org membership
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const orgId = membership.organization_id

  // Fetch aircraft details
  const { data: aircraft, error: acError } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, year, total_time_hours, organization_id, operation_types')
    .eq('id', aircraft_id)
    .eq('organization_id', orgId)
    .single()

  if (acError || !aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }

  // Fetch most recent maintenance events to find last annual date
  const { data: maintenanceEvents } = await supabase
    .from('maintenance_events')
    .select(`
      id,
      event_date,
      event_type,
      airframe_tt,
      truth_state,
      canonicalization_status,
      is_verified,
      document_id,
      source_segment_id,
      current_canonical_version_id
    `)
    .eq('aircraft_id', aircraft_id)
    .order('event_date', { ascending: false })
    .limit(50)

  // Find last annual inspection date
  const lastAnnual = maintenanceEvents?.find(e =>
    e.event_type?.toLowerCase().includes('annual') ||
    e.event_type?.toLowerCase().includes('inspection')
  )

  // Find last transponder check
  const lastTransponder = maintenanceEvents?.find(e =>
    e.event_type?.toLowerCase().includes('transponder') ||
    e.event_type?.toLowerCase().includes('pitot')
  )
  const lastHundredHour = maintenanceEvents?.find(e =>
    e.event_type?.toLowerCase().includes('100') ||
    e.event_type?.toLowerCase().includes('100-hour')
  )

  // Check existing active reminders for this aircraft to avoid duplicates
  const { data: existingReminders } = await supabase
    .from('reminders')
    .select('reminder_type')
    .eq('aircraft_id', aircraft_id)
    .eq('organization_id', orgId)
    .in('status', ['active', 'snoozed'])

  const existingTypes = new Set(existingReminders?.map(r => r.reminder_type) ?? [])

  const now = new Date()
  const remindersToCreate: StandardReminder[] = []
  const canonicalAnnual = lastAnnual && isCanonicalMaintenanceEvent(lastAnnual) ? lastAnnual : null
  const canonicalTransponder = lastTransponder && isCanonicalMaintenanceEvent(lastTransponder) ? lastTransponder : null
  const canonicalHundredHour = lastHundredHour && isCanonicalMaintenanceEvent(lastHundredHour) ? lastHundredHour : null
  const operationLabels = getOperationTypeLabels(aircraft.operation_types)
  const forHireOperation = isForHireOperation(aircraft.operation_types)

  // Annual inspection: auto-activate only when backed by canonical evidence.
  if (!existingTypes.has('annual')) {
    if (canonicalAnnual?.event_date) {
      const dueDate = addMonths(new Date(canonicalAnnual.event_date), 12)
      remindersToCreate.push({
        reminder_type: 'annual',
        title: 'Annual Inspection',
        description: `Backed by canonical maintenance evidence dated ${canonicalAnnual.event_date}. FAR 91.409 requires annual inspection every 12 calendar months.`,
        priority: dueDate < now ? 'critical' : dueDate < addMonths(now, 2) ? 'high' : 'normal',
        due_date: toDateString(dueDate),
        activation_state: 'canonical',
        activation_block_reason: null,
        evidence_document_id: canonicalAnnual.document_id ?? null,
        evidence_segment_id: canonicalAnnual.source_segment_id ?? null,
        canonical_record_version_id: canonicalAnnual.current_canonical_version_id ?? null,
      })
    } else {
      remindersToCreate.push({
        reminder_type: 'annual',
        title: 'Annual Inspection',
        description: 'No canonical annual inspection record is available yet. Review scanned logbook evidence before treating this as an active compliance reminder.',
        priority: 'high',
        activation_state: 'review_required',
        activation_block_reason: 'missing_canonical_annual_evidence',
      })
    }
  }

  // 100-hour inspection depends on operating context; keep it informational until the basis is reviewed.
  if (!existingTypes.has('100hr')) {
    const currentHours = aircraft.total_time_hours
    const operationSummary = operationLabels.length > 0
      ? `Current operation profile: ${operationLabels.join(', ')}.`
      : 'No operation profile is stored yet.'

    if (forHireOperation && canonicalHundredHour?.airframe_tt != null) {
      const dueHours = Number(canonicalHundredHour.airframe_tt) + 100
      const hoursRemaining = currentHours != null ? dueHours - currentHours : undefined
      remindersToCreate.push({
        reminder_type: '100hr',
        title: '100-Hour Inspection',
        description: `${operationSummary} 100-hour inspections apply to for-hire/training operations. Baseline evidence is the canonical 100-hour event at ${Number(canonicalHundredHour.airframe_tt).toLocaleString()} hrs.`,
        priority: hoursRemaining != null && hoursRemaining <= 10 ? 'high' : 'normal',
        due_hours: dueHours,
        current_hours: currentHours ?? undefined,
        hours_remaining: hoursRemaining,
        activation_state: 'canonical',
        activation_block_reason: null,
        evidence_document_id: canonicalHundredHour.document_id ?? null,
        evidence_segment_id: canonicalHundredHour.source_segment_id ?? null,
        canonical_record_version_id: canonicalHundredHour.current_canonical_version_id ?? null,
      })
    } else if (forHireOperation) {
      remindersToCreate.push({
        reminder_type: '100hr',
        title: '100-Hour Inspection',
        description: `${operationSummary} This aircraft appears to be in a for-hire/training context, but no canonical 100-hour baseline was found. Review logbook evidence before activating a hard due reminder.`,
        priority: 'high',
        current_hours: currentHours ?? undefined,
        activation_state: 'review_required',
        activation_block_reason: 'missing_canonical_100hr_baseline',
      })
    } else {
      remindersToCreate.push({
        reminder_type: '100hr',
        title: '100-Hour Inspection',
        description: `${operationSummary} FAR 91.409 requires 100-hour inspections only for aircraft operated for hire. Keep this informational unless the aircraft begins rental, training, club, or charter use.`,
        priority: 'normal',
        current_hours: currentHours ?? undefined,
        activation_state: 'informational_only',
        activation_block_reason: operationLabels.length > 0 ? 'operation_profile_not_for_hire' : 'operating_basis_unknown',
      })
    }
  }

  // Transponder check: auto-activate only when backed by canonical evidence.
  if (!existingTypes.has('transponder')) {
    if (canonicalTransponder?.event_date) {
      const dueDate = addMonths(new Date(canonicalTransponder.event_date), 24)
      remindersToCreate.push({
        reminder_type: 'transponder',
        title: 'Transponder Check (FAR 91.413)',
        description: `Backed by canonical transponder/pitot-static evidence dated ${canonicalTransponder.event_date}. FAR 91.413 requires inspection every 24 calendar months.`,
        priority: dueDate < now ? 'high' : 'normal',
        due_date: toDateString(dueDate),
        activation_state: 'canonical',
        activation_block_reason: null,
        evidence_document_id: canonicalTransponder.document_id ?? null,
        evidence_segment_id: canonicalTransponder.source_segment_id ?? null,
        canonical_record_version_id: canonicalTransponder.current_canonical_version_id ?? null,
      })
    } else {
      remindersToCreate.push({
        reminder_type: 'transponder',
        title: 'Transponder Check (FAR 91.413)',
        description: 'No canonical transponder compliance record is available yet. Review maintenance evidence before treating this as an active compliance reminder.',
        priority: 'normal',
        activation_state: 'review_required',
        activation_block_reason: 'missing_canonical_transponder_evidence',
      })
    }
  }

  // ELT inspection: keep informational until supported by evidence.
  if (!existingTypes.has('elt')) {
    remindersToCreate.push({
      reminder_type: 'elt',
      title: 'ELT Inspection (FAR 91.207)',
      description: 'FAR 91.207 requires ELT inspection within 12 calendar months. This reminder is informational until a canonical ELT record is linked.',
      priority: 'normal',
      activation_state: 'informational_only',
      activation_block_reason: 'missing_canonical_elt_evidence',
    })
  }

  // Static/pitot system check: informational until IFR evidence and equipment applicability are confirmed.
  if (!existingTypes.has('static_pitot')) {
    remindersToCreate.push({
      reminder_type: 'static_pitot',
      title: 'Altimeter/Static System Check (FAR 91.411)',
      description: 'FAR 91.411 applies to IFR operations. This reminder remains informational until applicable equipment and canonical compliance evidence are confirmed.',
      priority: 'normal',
      activation_state: 'informational_only',
      activation_block_reason: 'ifr_applicability_and_evidence_pending',
    })
  }

  if (remindersToCreate.length === 0) {
    return NextResponse.json({ reminders: [], message: 'All standard reminders already exist.' })
  }

  // Insert all reminders
  const { data: created, error: insertError } = await supabase
    .from('reminders')
    .insert(
      remindersToCreate.map(r => ({
        organization_id: orgId,
        aircraft_id,
        reminder_type: r.reminder_type,
        title: r.title,
        description: r.description,
        priority: r.priority,
        due_date: r.due_date,
        due_hours: r.due_hours,
        current_hours: r.current_hours,
        hours_remaining: r.hours_remaining,
        canonical_record_version_id: r.canonical_record_version_id ?? null,
        evidence_segment_id: r.evidence_segment_id ?? null,
        evidence_document_id: r.evidence_document_id ?? null,
        activation_state: r.activation_state,
        activation_block_reason: r.activation_block_reason ?? null,
        auto_generated: true,
        status: 'active',
      }))
    )
    .select(`
      *,
      aircraft:aircraft_id(tail_number, make, model)
    `)

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    reminders: created ?? [],
    message: `Created ${created?.length ?? 0} reminders for ${aircraft.tail_number}.`,
  })
}
