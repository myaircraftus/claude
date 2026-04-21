/**
 * POST /api/ai/generate-logbook
 *
 * Generate a maintenance logbook entry draft from a squawk description and/or
 * work order context. Uses GPT-4o with structured JSON output.
 *
 * Body:
 *   {
 *     aircraft_id: string (UUID, required),
 *     squawk_description?: string,
 *     work_order_id?: string (UUID),
 *     entry_type?: LogbookEntryType,
 *     additional_context?: string,
 *   }
 *
 * Response (200):
 *   {
 *     description: string,
 *     entry_type: LogbookEntryType,
 *     parts_used: Array<{ part_number, description, quantity }>,
 *     references_used: Array<{ type, reference, note? }>,
 *     ad_numbers: string[],
 *     suggested_total_time_note: string,
 *   }
 */
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import type { OrgRole } from '@/types'

const VALID_ENTRY_TYPES = [
  'maintenance',
  'annual',
  '100hr',
  'discrepancy',
  'ad_compliance',
  'sb_compliance',
  'component_replacement',
  'oil_change',
  'return_to_service',
  'major_repair',
  'major_alteration',
  'owner_preventive',
] as const

type EntryType = (typeof VALID_ENTRY_TYPES)[number]

const SYSTEM_PROMPT = `You are an experienced FAA A&P mechanic drafting a maintenance logbook entry.
You produce concise, technical, regulation-appropriate entries that match 14 CFR 43.9 / 43.11 format.

Rules:
- "description" must be a concise technical narrative (1-4 sentences). Plain English, past tense. State what was done, why, and the result. Do NOT include the aircraft tail number or date — those are stored elsewhere.
- "entry_type" MUST be exactly one of: ${VALID_ENTRY_TYPES.join(', ')}. Pick the best match.
- "parts_used" is an array of parts. Each part has: part_number (string), description (string), quantity (number). If no parts, return [].
- "references_used" is an array of technical references cited. Each has: type (one of 'AD','SB','AMM','IPC','TCDS','STC','Manual','Other'), reference (string identifier like "AD 2019-12-03" or "SB MHB-94-8A"), note (optional short note). If none, return [].
- "ad_numbers" is an array of AD identifiers as plain strings (e.g. ["2019-12-03"]). Dedupe from references_used where applicable.
- "suggested_total_time_note" is a short hint for the mechanic on what to record for total_time / hobbs (e.g. "Record current tach at completion" or "No time change — inspection only"). 1 sentence max.

Output ONLY valid JSON matching the requested schema. Do not include markdown code fences.`

function normalizeEntryType(v: unknown, fallback: EntryType = 'maintenance'): EntryType {
  if (typeof v === 'string' && (VALID_ENTRY_TYPES as readonly string[]).includes(v)) {
    return v as EntryType
  }
  return fallback
}

function coercePartsUsed(v: unknown): Array<{ part_number: string; description: string; quantity: number }> {
  if (!Array.isArray(v)) return []
  return v
    .map((p) => {
      if (!p || typeof p !== 'object') return null
      const part_number = String((p as any).part_number ?? '').trim()
      const description = String((p as any).description ?? '').trim()
      const rawQty = (p as any).quantity
      const quantity = typeof rawQty === 'number' && Number.isFinite(rawQty) ? rawQty : 1
      if (!part_number && !description) return null
      return { part_number, description, quantity }
    })
    .filter(Boolean) as Array<{ part_number: string; description: string; quantity: number }>
}

function coerceReferences(
  v: unknown
): Array<{ type: string; reference: string; note?: string }> {
  if (!Array.isArray(v)) return []
  return v
    .map((r) => {
      if (!r || typeof r !== 'object') return null
      const type = String((r as any).type ?? 'Other').trim()
      const reference = String((r as any).reference ?? '').trim()
      if (!reference) return null
      const note = (r as any).note ? String((r as any).note).trim() : undefined
      return note ? { type, reference, note } : { type, reference }
    })
    .filter(Boolean) as Array<{ type: string; reference: string; note?: string }>
}

function coerceAdNumbers(v: unknown, refs: Array<{ type: string; reference: string }>): string[] {
  const out = new Set<string>()
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = String(item ?? '').trim()
      if (s) out.add(s)
    }
  }
  for (const r of refs) {
    if (r.type.toUpperCase() === 'AD') out.add(r.reference)
  }
  return Array.from(out)
}

export async function POST(req: NextRequest) {
  // Rate limit (10/min per IP)
  const ip = getClientIp(req.headers)
  const rl = rateLimit(`ai:generate-logbook:${ip}`, { limit: 10, windowSeconds: 60 })
  if (!rl.success) return rateLimitResponse(rl)

  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  if (!MECHANIC_AND_ABOVE.includes(membership.role as OrgRole)) {
    return NextResponse.json(
      { error: 'Mechanic role or above required' },
      { status: 403 }
    )
  }

  const orgId = membership.organization_id

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const aircraftId = typeof body?.aircraft_id === 'string' ? body.aircraft_id : null
  const squawkDescription =
    typeof body?.squawk_description === 'string' ? body.squawk_description.trim() : ''
  const workOrderId = typeof body?.work_order_id === 'string' ? body.work_order_id : null
  const additionalContext =
    typeof body?.additional_context === 'string' ? body.additional_context.trim() : ''
  const requestedEntryType = normalizeEntryType(body?.entry_type)

  if (!aircraftId) {
    return NextResponse.json({ error: 'aircraft_id is required' }, { status: 400 })
  }
  if (!squawkDescription && !workOrderId && !additionalContext) {
    return NextResponse.json(
      { error: 'Provide at least one of squawk_description, work_order_id, or additional_context' },
      { status: 400 }
    )
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'AI generation is not configured on this server', code: 'SERVICE_NOT_CONFIGURED' },
      { status: 503 }
    )
  }

  // Gather aircraft + optional work-order context (same org scope)
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select(
      'id, tail_number, make, model, year, serial_number, engine_make, engine_model, engine_serial, total_time_hours'
    )
    .eq('id', aircraftId)
    .eq('organization_id', orgId)
    .single()

  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }

  let workOrder: any = null
  if (workOrderId) {
    const { data: wo } = await supabase
      .from('work_orders')
      .select('id, work_order_number, customer_complaint, discrepancy, findings, corrective_action, troubleshooting_notes')
      .eq('id', workOrderId)
      .eq('organization_id', orgId)
      .maybeSingle()
    workOrder = wo
  }

  const aircraftLine = [
    aircraft.year,
    aircraft.make,
    aircraft.model,
    aircraft.tail_number && `(${aircraft.tail_number})`,
    aircraft.serial_number && `S/N ${aircraft.serial_number}`,
  ]
    .filter(Boolean)
    .join(' ')

  const engineLine = aircraft.engine_make
    ? `Engine: ${aircraft.engine_make}${aircraft.engine_model ? ' ' + aircraft.engine_model : ''}${aircraft.engine_serial ? ' S/N ' + aircraft.engine_serial : ''}`
    : ''

  const userPrompt = [
    `Aircraft: ${aircraftLine || 'Unknown aircraft'}`,
    engineLine,
    aircraft.total_time_hours ? `Airframe TT: ${aircraft.total_time_hours} hrs` : '',
    `Requested entry_type (mechanic's hint): ${requestedEntryType}`,
    '',
    squawkDescription ? `Squawk / discrepancy reported:\n${squawkDescription}` : '',
    workOrder
      ? `\nWork Order ${workOrder.work_order_number}:\n- Complaint: ${workOrder.customer_complaint ?? 'n/a'}\n- Discrepancy: ${workOrder.discrepancy ?? 'n/a'}\n- Findings: ${workOrder.findings ?? 'n/a'}\n- Troubleshooting: ${workOrder.troubleshooting_notes ?? 'n/a'}\n- Corrective action: ${workOrder.corrective_action ?? 'n/a'}`
      : '',
    additionalContext ? `\nAdditional context from mechanic:\n${additionalContext}` : '',
    '',
    `Draft a logbook entry. Return JSON with keys: description, entry_type, parts_used, references_used, ad_numbers, suggested_total_time_note.`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 502 })
    }

    const parsed = JSON.parse(content)
    const references_used = coerceReferences(parsed?.references_used)
    const parts_used = coercePartsUsed(parsed?.parts_used)
    const ad_numbers = coerceAdNumbers(parsed?.ad_numbers, references_used)
    const entry_type = normalizeEntryType(parsed?.entry_type, requestedEntryType)
    const description = String(parsed?.description ?? '').trim()
    const suggested_total_time_note = String(parsed?.suggested_total_time_note ?? '').trim()

    if (!description) {
      return NextResponse.json(
        { error: 'AI returned an empty description' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      description,
      entry_type,
      parts_used,
      references_used,
      ad_numbers,
      suggested_total_time_note,
    })
  } catch (err: any) {
    console.error('generate-logbook failed:', err)
    return NextResponse.json(
      { error: 'Failed to generate logbook entry' },
      { status: 500 }
    )
  }
}
