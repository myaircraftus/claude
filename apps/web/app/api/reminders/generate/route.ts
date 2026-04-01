import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

interface StandardReminder {
  reminder_type: string
  title: string
  description: string
  priority: string
  due_date?: string
  due_hours?: number
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]
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
    .select('id, tail_number, make, model, year, total_time_hours, organization_id')
    .eq('id', aircraft_id)
    .eq('organization_id', orgId)
    .single()

  if (acError || !aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }

  // Fetch most recent maintenance events to find last annual date
  const { data: maintenanceEvents } = await supabase
    .from('maintenance_events')
    .select('event_date, event_type, airframe_tt')
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

  // Annual inspection (due 12 months from last annual, or 12 months from now if unknown)
  if (!existingTypes.has('annual')) {
    const baseDate = lastAnnual?.event_date ? new Date(lastAnnual.event_date) : now
    const dueDate = addMonths(baseDate, 12)
    remindersToCreate.push({
      reminder_type: 'annual',
      title: 'Annual Inspection',
      description: lastAnnual
        ? `Based on last annual recorded on ${lastAnnual.event_date}. FAR 91.409 requires annual inspection every 12 calendar months.`
        : 'No prior annual found in records. Date estimated — verify with logbooks. FAR 91.409 requires annual inspection every 12 calendar months.',
      priority: dueDate < now ? 'critical' : dueDate < addMonths(now, 2) ? 'high' : 'normal',
      due_date: toDateString(dueDate),
    })
  }

  // 100-hour inspection (if operated for hire; due at current_hours + 100)
  if (!existingTypes.has('100hr')) {
    const currentHours = aircraft.total_time_hours
    remindersToCreate.push({
      reminder_type: '100hr',
      title: '100-Hour Inspection',
      description: currentHours != null
        ? `Current airframe TT: ${currentHours.toLocaleString()} hrs. FAR 91.409 requires 100-hour inspection for aircraft operated for hire.`
        : 'Current hours unknown. FAR 91.409 requires 100-hour inspection for aircraft operated for hire.',
      priority: 'normal',
      due_hours: currentHours != null ? Math.ceil((currentHours + 100) / 10) * 10 : undefined,
    })
  }

  // Transponder check (every 24 months per FAR 91.413)
  if (!existingTypes.has('transponder')) {
    const baseDate = lastTransponder?.event_date ? new Date(lastTransponder.event_date) : now
    const dueDate = addMonths(baseDate, 24)
    remindersToCreate.push({
      reminder_type: 'transponder',
      title: 'Transponder Check (FAR 91.413)',
      description: 'FAR 91.413 requires transponder testing and inspection every 24 calendar months.',
      priority: dueDate < now ? 'high' : 'normal',
      due_date: toDateString(dueDate),
    })
  }

  // ELT inspection (every 12 months per FAR 91.207)
  if (!existingTypes.has('elt')) {
    const dueDate = addMonths(now, 12)
    remindersToCreate.push({
      reminder_type: 'elt',
      title: 'ELT Inspection (FAR 91.207)',
      description: 'FAR 91.207 requires ELT inspection within 12 calendar months. Also check battery expiration date.',
      priority: 'normal',
      due_date: toDateString(dueDate),
    })
  }

  // Static/pitot system check (every 24 months for IFR, FAR 91.411)
  if (!existingTypes.has('static_pitot')) {
    const dueDate = addMonths(now, 24)
    remindersToCreate.push({
      reminder_type: 'static_pitot',
      title: 'Altimeter/Static System Check (FAR 91.411)',
      description: 'FAR 91.411 requires altimeter and static pressure system check every 24 calendar months for IFR operations.',
      priority: 'normal',
      due_date: toDateString(dueDate),
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
