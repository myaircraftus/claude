import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

const WRITE_ROLES = new Set(['owner', 'admin', 'mechanic'])

interface DueCandidate {
  title: string
  description: string
  business_category: string
  due_basis: 'calendar' | 'tach' | 'hobbs' | 'total_time' | 'cycles' | 'event' | 'mixed'
  ata_code?: string
  jasc_code?: string
  reason: string
  confidence: 'high' | 'medium' | 'low' | 'unknown' | 'needs_review'
  source_reference?: string
}

function includesAny(values: unknown, terms: string[]) {
  const text = Array.isArray(values) ? values.join(' ') : String(values ?? '')
  return terms.some((term) => text.toLowerCase().includes(term))
}

function buildCandidates(aircraft: Record<string, any>): DueCandidate[] {
  const forHire = includesAny(aircraft.operation_types, ['flight_school', 'leaseback', 'part_135', 'rental', 'club'])
  const maintenanceProgram = String(aircraft.maintenance_program_type ?? '').toLowerCase()

  const candidates: DueCandidate[] = [
    {
      title: 'Annual inspection',
      description: 'Review and track annual inspection currency. Confirm last completed date and aircraft total time before activating.',
      business_category: 'Scheduled Inspection',
      due_basis: 'calendar',
      ata_code: '05',
      jasc_code: '0500',
      reason: 'Annual inspection tracking is common for Part 91 aircraft and should be confirmed from records.',
      confidence: 'medium',
      source_reference: 'Operation profile / inspection program',
    },
    {
      title: 'ELT battery and inspection review',
      description: 'Confirm ELT inspection and battery replacement date from placard or records.',
      business_category: 'Recurring Compliance',
      due_basis: 'calendar',
      ata_code: '25',
      jasc_code: '2560',
      reason: 'Emergency equipment dates are frequently missed during onboarding and should be reviewed.',
      confidence: 'medium',
      source_reference: 'Aircraft equipment review',
    },
    {
      title: 'Transponder / altimeter certification',
      description: 'Verify current transponder, altimeter, and static system inspection status where applicable.',
      business_category: 'Recurring Compliance',
      due_basis: 'calendar',
      ata_code: '34',
      jasc_code: '3440',
      reason: 'Avionics certification currency depends on operation and equipment; human confirmation required.',
      confidence: 'low',
      source_reference: 'Operation profile / avionics review',
    },
    {
      title: 'Oil and filter service',
      description: 'Set a shop-approved oil service interval using verified Tach/Hobbs and last service records.',
      business_category: 'Preventive Maintenance',
      due_basis: 'tach',
      ata_code: '79',
      jasc_code: '7920',
      reason: 'Engine oil service is a common recurring maintenance planning item.',
      confidence: 'low',
      source_reference: 'Shop template',
    },
    {
      title: 'Brake system condition review',
      description: 'Review wheels, brakes, and tire condition during next inspection or squawk triage.',
      business_category: 'Inspection',
      due_basis: 'event',
      ata_code: '32',
      jasc_code: '3240',
      reason: 'Landing gear/brake condition is a common due-list grouping and squawk route.',
      confidence: 'low',
      source_reference: 'Shop template',
    },
  ]

  if (forHire || maintenanceProgram.includes('100')) {
    candidates.splice(1, 0, {
      title: '100-hour inspection',
      description: 'Track 100-hour inspection applicability and next due time. Confirm whether the aircraft operation requires this interval.',
      business_category: 'Scheduled Inspection',
      due_basis: 'tach',
      ata_code: '05',
      jasc_code: '0510',
      reason: 'The operation profile indicates flight school, rental, charter, or another higher-utilization context.',
      confidence: forHire ? 'medium' : 'low',
      source_reference: 'Operation profile',
    })
  }

  return candidates
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(_req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!WRITE_ROLES.has(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const supabase = createServerSupabase()
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, organization_id, tail_number, make, model, operation_types, maintenance_program_type')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

  const rawCandidates = buildCandidates(aircraft)
  const jascCodes = rawCandidates.map((candidate) => candidate.jasc_code).filter(Boolean) as string[]
  const { data: validJascRows } = jascCodes.length
    ? await supabase.from('jasc_codes').select('jasc_code, ata_code').in('jasc_code', jascCodes)
    : { data: [] }
  const validByJasc = new Map((validJascRows ?? []).map((row: any) => [row.jasc_code, row]))

  const candidates = rawCandidates.map((candidate) => {
    const taxonomy = candidate.jasc_code ? validByJasc.get(candidate.jasc_code) : null
    return {
      ...candidate,
      ata_code: taxonomy?.ata_code ?? candidate.ata_code ?? null,
      jasc_code: taxonomy?.jasc_code ?? null,
    }
  })

  const { data: existingDueItems } = await supabase
    .from('aircraft_due_items')
    .select('title')
    .eq('organization_id', ctx.organizationId)
    .eq('aircraft_id', params.id)
    .is('deleted_at', null)

  const existingTitles = new Set((existingDueItems ?? []).map((item: any) => String(item.title).toLowerCase()))
  const newCandidates = candidates.filter((candidate) => !existingTitles.has(candidate.title.toLowerCase()))

  if (newCandidates.length === 0) {
    return NextResponse.json({ created: [], skipped: candidates.length })
  }

  const { data: suggestion, error: suggestionError } = await supabase
    .from('ai_suggestions')
    .insert({
      organization_id: ctx.organizationId,
      aircraft_id: params.id,
      module: 'due_list',
      suggestion_type: 'ai_due_list',
      title: `AI due-list draft for ${aircraft.tail_number}`,
      payload: {
        aircraft: {
          tail_number: aircraft.tail_number,
          make: aircraft.make,
          model: aircraft.model,
        },
        candidates: newCandidates,
      },
      status: 'needs_review',
      confidence: 'medium',
      source_context: 'aircraft_workspace',
      created_by: ctx.user.id,
    })
    .select('*')
    .single()

  if (suggestionError) return NextResponse.json({ error: suggestionError.message }, { status: 500 })

  const { data: dueItems, error: dueError } = await supabase
    .from('aircraft_due_items')
    .insert(newCandidates.map((candidate) => ({
      organization_id: ctx.organizationId,
      aircraft_id: params.id,
      title: candidate.title,
      description: `${candidate.description}\n\nWhy suggested: ${candidate.reason}`,
      status: 'needs_review',
      ata_code: candidate.ata_code ?? null,
      jasc_code: candidate.jasc_code ?? null,
      business_category: candidate.business_category,
      source_type: 'ai',
      source_reference: candidate.source_reference ?? null,
      due_basis: candidate.due_basis,
      confidence: candidate.confidence,
      classification_source: candidate.ata_code || candidate.jasc_code ? 'ai' : 'unknown',
      classification_confidence: candidate.confidence === 'high' ? 'high' : candidate.confidence === 'medium' ? 'medium' : 'low',
      classification_status: candidate.ata_code || candidate.jasc_code ? 'suggested' : 'unclassified',
      review_state: 'suggested',
      owner_visible: false,
      created_by: ctx.user.id,
    })))
    .select('*')

  if (dueError) return NextResponse.json({ error: dueError.message }, { status: 500 })

  await Promise.all([
    supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      user_id: ctx.user.id,
      action: 'aircraft.ai_due_list_generated',
      entity_type: 'aircraft',
      entity_id: params.id,
      metadata_json: {
        suggestion_id: suggestion.id,
        created_count: dueItems?.length ?? 0,
      },
    }),
    supabase.from('aircraft_timeline_events').insert({
      organization_id: ctx.organizationId,
      aircraft_id: params.id,
      module: 'ai_assistant',
      action: 'ai_due_list_generated',
      source_record_type: 'ai_suggestions',
      source_record_id: suggestion.id,
      title: 'AI due-list draft generated',
      summary: `${dueItems?.length ?? 0} suggested due items are waiting for human review.`,
      actor_id: ctx.user.id,
      metadata: { suggestion_id: suggestion.id },
    }),
  ]).catch(() => null)

  return NextResponse.json({
    suggestion,
    created: dueItems ?? [],
    skipped: candidates.length - newCandidates.length,
  }, { status: 201 })
}
