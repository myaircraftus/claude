import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import OpenAI from 'openai'
import {
  extractChecklistTemplateReferenceLibrary,
  getChecklistTemplateLabel,
  inferChecklistTemplateKey,
  normalizeChecklistTemplateKey,
} from '@/lib/work-orders/checklists'

type AircraftContext = {
  id: string
  tail_number: string | null
  make: string | null
  model: string | null
  year: number | null
  engine_make: string | null
  engine_model: string | null
}

type WorkOrderChecklistItem = {
  template_key: string
  template_label: string
  item_label: string
  item_description?: string | null
  source_reference?: string | null
  required: boolean
  completed: boolean
  sort_order: number
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function uniqueTrimmed(values: Array<string | null | undefined>, limit = 5) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const trimmed = value?.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
    if (result.length >= limit) break
  }

  return result
}

function summarizeWorkOrderChecklist(items: WorkOrderChecklistItem[]) {
  if (items.length === 0) return null

  const templateKey = normalizeChecklistTemplateKey(items[0]?.template_key) ?? null
  const templateLabel =
    items.find((item) => item.template_label?.trim())?.template_label?.trim()
    ?? getChecklistTemplateLabel(templateKey)
  const requiredItems = items.filter((item) => item.required)
  const completedRequiredItems = requiredItems.filter((item) => item.completed)
  const openRequiredItems = requiredItems.filter((item) => !item.completed)
  const completedItems = items.filter((item) => item.completed)
  const sourceReferences = uniqueTrimmed(items.map((item) => item.source_reference), 6)

  return {
    templateKey,
    templateLabel,
    requiredCount: requiredItems.length,
    completedRequiredCount: completedRequiredItems.length,
    completedItems: completedItems.map((item) => item.item_label).slice(0, 8),
    openRequiredItems: openRequiredItems.map((item) => item.item_label).slice(0, 8),
    sourceReferences,
  }
}

function buildDraftTitle(params: {
  aircraft: AircraftContext | null
  structuredEntryType?: string | null
  entryType?: string | null
  checklistTemplateLabel?: string | null
}) {
  const aircraftLabel = params.aircraft?.tail_number?.trim() || 'Maintenance entry'
  const entryLabel =
    params.structuredEntryType?.trim()
    || params.entryType?.trim()
    || params.checklistTemplateLabel?.trim()
    || 'Generated draft'

  return `${aircraftLabel} · ${entryLabel.replace(/_/g, ' ')}`
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const prompt = String(body?.prompt ?? '')
  const aircraftId = isUuid(body?.aircraft_id) ? body.aircraft_id : null
  const workOrderId = isUuid(body?.work_order_id) ? body.work_order_id : null
  const entryType = typeof body?.entry_type === 'string' ? body.entry_type : null
  const logbookType = typeof body?.logbook_type === 'string' ? body.logbook_type : null
  const dryRun = body?.dry_run === true

  if (!prompt.trim()) return NextResponse.json({ error: 'Prompt required' }, { status: 400 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let aircraft: AircraftContext | null = null
  if (aircraftId) {
    const { data } = await supabase
      .from('aircraft')
      .select('id, tail_number, make, model, year, engine_make, engine_model')
      .eq('id', aircraftId)
      .single()
    aircraft = data
  }

  const { data: organization } = await supabase
    .from('organizations')
    .select('name, checklist_templates')
    .eq('id', membership.organization_id)
    .maybeSingle()

  let workOrderChecklistItems: WorkOrderChecklistItem[] = []
  if (workOrderId) {
    const { data } = await supabase
      .from('work_order_checklist_items')
      .select(`
        template_key,
        template_label,
        item_label,
        item_description,
        source_reference,
        required,
        completed,
        sort_order
      `)
      .eq('organization_id', membership.organization_id)
      .eq('work_order_id', workOrderId)
      .order('sort_order', { ascending: true })

    workOrderChecklistItems = data ?? []
  }

  const workOrderChecklistSummary = summarizeWorkOrderChecklist(workOrderChecklistItems)
  const referenceLibrary = extractChecklistTemplateReferenceLibrary(
    organization?.checklist_templates
  )
  const checklistTemplateKey =
    normalizeChecklistTemplateKey(entryType)
    ?? workOrderChecklistSummary?.templateKey
    ?? inferChecklistTemplateKey(entryType, prompt, prompt)
  const checklistReferenceNames = checklistTemplateKey
    ? uniqueTrimmed(
        (referenceLibrary.checklist[checklistTemplateKey] ?? []).map((asset) => asset.name),
        5
      )
    : []
  const logbookReferenceNames = uniqueTrimmed(
    referenceLibrary.logbook.map((asset) => asset.name),
    5
  )
  const organizationName = organization?.name?.trim() || 'Organization'
  const shopReferenceContext = [
    logbookReferenceNames.length > 0
      ? `Approved shop logbook references: ${logbookReferenceNames.join(', ')}. Prefer their wording style and structure before falling back to generic phrasing.`
      : null,
    checklistReferenceNames.length > 0
      ? `Checklist references for this maintenance type: ${checklistReferenceNames.join(', ')}. Keep the wording aligned with these references where the prompt supports it.`
      : null,
    workOrderChecklistSummary
      ? [
          `Linked work order checklist template: ${workOrderChecklistSummary.templateLabel}.`,
          `Required checklist completion: ${workOrderChecklistSummary.completedRequiredCount}/${workOrderChecklistSummary.requiredCount}.`,
          workOrderChecklistSummary.completedItems.length > 0
            ? `Completed checklist items: ${workOrderChecklistSummary.completedItems.join(', ')}.`
            : null,
          workOrderChecklistSummary.openRequiredItems.length > 0
            ? `Open required checklist items: ${workOrderChecklistSummary.openRequiredItems.join(', ')}. Do not describe these as completed unless the prompt explicitly says they were performed; instead add a warning if they may block final signoff.`
            : null,
          workOrderChecklistSummary.sourceReferences.length > 0
            ? `Checklist source references: ${workOrderChecklistSummary.sourceReferences.join(' | ')}.`
            : null,
        ]
          .filter(Boolean)
          .join(' ')
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const systemPrompt = `You are a professional aviation maintenance record specialist with deep knowledge of FAA regulations, Part 43 maintenance requirements, and standard logbook entry format.

Your job is to convert plain English descriptions of aircraft maintenance into properly formatted, FAA-compliant maintenance logbook entries.

Rules:
1. Use professional, accurate aviation terminology
2. Include all required elements per Part 43 Appendix B:
   - Date of work
   - Description of work performed (detailed but concise)
   - Aircraft identification (tail number if known)
   - Part numbers and serial numbers if mentioned
   - References (AD numbers, SB numbers, FAR sections)
   - Approval for return to service (if applicable)
   - Signature block placeholder
3. Do NOT fabricate compliance information not in the original description
4. Flag if the work described requires FAA Form 337
5. Suggest which logbook(s) should receive the entry
6. Identify if this is a recurring item and note the next due interval
7. If shop-approved references are provided, mirror their tone and structure, but never invent facts that are not in the prompt or aircraft context
8. If a linked checklist shows required items still open, add a warning that final signoff may be premature; do not claim those open items were completed

Aircraft context: ${
    aircraft
      ? `${aircraft.tail_number} - ${aircraft.make} ${aircraft.model} ${aircraft.year ?? ''} (Engine: ${aircraft.engine_make ?? 'N/A'} ${aircraft.engine_model ?? ''})`
      : 'Not specified'
  }
Organization context: ${organizationName}
Checklist template context: ${checklistTemplateKey ? getChecklistTemplateLabel(checklistTemplateKey) : 'Not specified'}
Entry type: ${entryType ?? 'Not specified'}
Logbook type: ${logbookType ?? 'Not specified'}
Today's date: ${new Date().toISOString().split('T')[0]}
${shopReferenceContext ? `\n${shopReferenceContext}\n` : ''}

Respond with a JSON object:
{
  "formatted_entry": "The complete formatted logbook entry text",
  "structured_fields": {
    "date": "YYYY-MM-DD or null",
    "entry_type": "100hr|annual|oil_change|repair|maintenance|overhaul|ad_compliance|other",
    "logbook_type": "airframe|engine|prop|avionics|multiple",
    "tach_reference": "extracted tach/hobbs if mentioned, or null",
    "airframe_tt": "extracted total time if mentioned, or null",
    "parts_referenced": ["list of part numbers mentioned"],
    "ad_references": ["list of AD numbers mentioned"],
    "sb_references": ["list of SB numbers mentioned"],
    "requires_337": true,
    "337_reason": "reason if requires_337 is true, or null",
    "next_due_interval": "e.g. '100 hours' or '12 calendar months' or null",
    "suggested_logbooks": ["airframe", "engine", etc.]
  },
  "warnings": ["any warnings about the entry"],
  "notes": "any additional notes for the mechanic"
}`

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt.trim() },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const rawResult = completion.choices[0].message.content ?? '{}'
    const parsed = JSON.parse(rawResult)
    const structuredFields =
      parsed?.structured_fields && typeof parsed.structured_fields === 'object'
        ? parsed.structured_fields as Record<string, unknown>
        : {}
    const warnings = uniqueTrimmed(
      [
        ...(Array.isArray(parsed?.warnings) ? parsed.warnings : []),
        workOrderChecklistSummary?.openRequiredItems.length
          ? `Required checklist items still open on linked work order: ${workOrderChecklistSummary.openRequiredItems.join(', ')}`
          : null,
      ],
      8
    )

    const structuredFieldsResponse: Record<string, unknown> = {
      ...structuredFields,
      checklist_template_key: checklistTemplateKey ?? null,
      shop_logbook_references: logbookReferenceNames,
      shop_checklist_references: checklistReferenceNames,
      linked_work_order_id: workOrderId,
    }

    const result: {
      formatted_entry: string
      structured_fields: Record<string, unknown>
      warnings: string[]
      notes: string | null
      source_context: {
        organization_name: string
        checklist_template_key: string | null
        checklist_template_label: string | null
        checklist_reference_names: string[]
        logbook_reference_names: string[]
        work_order_checklist: ReturnType<typeof summarizeWorkOrderChecklist>
      }
    } = {
      formatted_entry: typeof parsed?.formatted_entry === 'string' ? parsed.formatted_entry : '',
      structured_fields: structuredFieldsResponse,
      warnings,
      notes: typeof parsed?.notes === 'string' ? parsed.notes : null,
      source_context: {
        organization_name: organizationName,
        checklist_template_key: checklistTemplateKey,
        checklist_template_label:
          workOrderChecklistSummary?.templateLabel
          ?? (checklistTemplateKey ? getChecklistTemplateLabel(checklistTemplateKey) : null),
        checklist_reference_names: checklistReferenceNames,
        logbook_reference_names: logbookReferenceNames,
        work_order_checklist: workOrderChecklistSummary,
      },
    }

    const shouldPersistDraft = !dryRun && !!aircraft?.id

    let draft: { id: string } | null = null
    if (shouldPersistDraft && aircraft?.id) {
      try {
        const { data } = await supabase
          .from('maintenance_entry_drafts')
          .insert({
            organization_id: membership.organization_id,
            aircraft_id: aircraft.id,
            created_by: user.id,
            title: buildDraftTitle({
              aircraft,
              structuredEntryType:
                typeof result.structured_fields.entry_type === 'string'
                  ? result.structured_fields.entry_type
                  : null,
              entryType,
              checklistTemplateLabel:
                result.source_context.checklist_template_label ?? undefined,
            }),
            entry_type: result.structured_fields.entry_type ?? entryType ?? null,
            logbook_type: result.structured_fields.logbook_type ?? logbookType ?? null,
            ai_prompt: prompt.trim(),
            ai_generated_text: result.formatted_entry || null,
            structured_fields: result.structured_fields,
            status: 'draft',
          })
          .select('id')
          .single()
        draft = data
      } catch {
        // Table may not exist yet — non-fatal
      }
    }

    return NextResponse.json({ ...result, draft_id: draft?.id ?? null })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[maintenance/generate] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
