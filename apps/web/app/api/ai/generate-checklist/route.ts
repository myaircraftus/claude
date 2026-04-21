/**
 * POST /api/ai/generate-checklist
 *
 * Generate an inspection / maintenance checklist from an AD/SB reference or a
 * requested scope (annual, 100hr, AD, SB, custom). Uses GPT-4o with structured
 * JSON output.
 *
 * Body:
 *   {
 *     aircraft_id: string (UUID, required),
 *     work_order_id?: string (UUID),
 *     scope: 'annual' | '100hr' | 'AD' | 'SB' | 'custom' (required),
 *     reference?: string,   // e.g. "AD 2019-12-03" or an SB number
 *     prompt?: string,      // free-text prompt when scope === 'custom'
 *   }
 *
 * Response (200):
 *   { items: Array<{ title: string, description: string, required: boolean, reference?: string }> }
 */
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import type { OrgRole } from '@/types'

const VALID_SCOPES = ['annual', '100hr', 'AD', 'SB', 'custom'] as const
type Scope = (typeof VALID_SCOPES)[number]

const SYSTEM_PROMPT = `You are an experienced FAA A&P/IA mechanic. You produce practical, aircraft-appropriate
inspection and maintenance checklists.

Rules:
- Return ONLY valid JSON: { "items": [ { "title": string, "description": string, "required": boolean, "reference"?: string } ] }.
- 6-20 items typical. Order them the way a mechanic would actually perform them.
- "title" is short (≤ 70 chars). "description" is a concrete instruction (1-3 sentences). Use industry-standard terminology.
- "required" = true for items that are regulatory or safety-critical; false for recommended/optional.
- Include "reference" where a specific AD, SB, AMM chapter, or 14 CFR part applies (e.g. "AD 2019-12-03" or "14 CFR 43 App D").
- If a scope is "AD" or "SB" with a reference, focus tightly on that compliance action.
- Never fabricate AD or SB numbers — only cite what the user provided, or well-known, broadly applicable references.
- Do not include markdown or code fences.`

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const rl = rateLimit(`ai:generate-checklist:${ip}`, { limit: 10, windowSeconds: 60 })
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

  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })
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
  const workOrderId = typeof body?.work_order_id === 'string' ? body.work_order_id : null
  const reference = typeof body?.reference === 'string' ? body.reference.trim() : ''
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  const scope = (VALID_SCOPES as readonly string[]).includes(body?.scope)
    ? (body.scope as Scope)
    : null

  if (!aircraftId) {
    return NextResponse.json({ error: 'aircraft_id is required' }, { status: 400 })
  }
  if (!scope) {
    return NextResponse.json(
      { error: `scope must be one of ${VALID_SCOPES.join(', ')}` },
      { status: 400 }
    )
  }
  if (scope === 'AD' || scope === 'SB') {
    if (!reference) {
      return NextResponse.json(
        { error: `reference is required for scope "${scope}"` },
        { status: 400 }
      )
    }
  }
  if (scope === 'custom' && !prompt) {
    return NextResponse.json(
      { error: 'prompt is required for scope "custom"' },
      { status: 400 }
    )
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'AI generation is not configured on this server', code: 'SERVICE_NOT_CONFIGURED' },
      { status: 503 }
    )
  }

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, year, engine_make, engine_model')
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
      .select('id, work_order_number, customer_complaint, discrepancy')
      .eq('id', workOrderId)
      .eq('organization_id', orgId)
      .maybeSingle()
    workOrder = wo
  }

  const aircraftLine = [aircraft.year, aircraft.make, aircraft.model, aircraft.tail_number && `(${aircraft.tail_number})`]
    .filter(Boolean)
    .join(' ')
  const engineLine = aircraft.engine_make
    ? `Engine: ${aircraft.engine_make}${aircraft.engine_model ? ' ' + aircraft.engine_model : ''}`
    : ''

  const scopeLine = (() => {
    switch (scope) {
      case 'annual':
        return 'Scope: Annual inspection per 14 CFR 43 Appendix D (as applicable to this aircraft type).'
      case '100hr':
        return 'Scope: 100-hour inspection per 14 CFR 43 Appendix D (as applicable to this aircraft type).'
      case 'AD':
        return `Scope: Compliance checklist for AD ${reference}. Focus only on the steps required to comply with this AD.`
      case 'SB':
        return `Scope: Compliance checklist for Service Bulletin ${reference}.`
      case 'custom':
      default:
        return `Scope: Custom request from mechanic. Request: ${prompt}`
    }
  })()

  const userPrompt = [
    `Aircraft: ${aircraftLine || 'Unknown aircraft'}`,
    engineLine,
    workOrder
      ? `Work order ${workOrder.work_order_number}: complaint="${workOrder.customer_complaint ?? ''}"  discrepancy="${workOrder.discrepancy ?? ''}"`
      : '',
    scopeLine,
    reference && (scope !== 'AD' && scope !== 'SB')
      ? `Additional reference the mechanic provided: ${reference}`
      : '',
    '',
    'Return JSON: { "items": [ { "title", "description", "required", "reference"? } ] }.',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 1800,
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
    const rawItems = Array.isArray(parsed?.items) ? parsed.items : []

    const items = rawItems
      .map((it: any) => {
        if (!it || typeof it !== 'object') return null
        const title = String(it.title ?? '').trim().slice(0, 140)
        const description = String(it.description ?? '').trim()
        if (!title || !description) return null
        const required = it.required === true || it.required === 'true'
        const ref = it.reference ? String(it.reference).trim() : ''
        return ref
          ? { title, description, required, reference: ref }
          : { title, description, required }
      })
      .filter(Boolean)

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'AI returned no checklist items' },
        { status: 502 }
      )
    }

    return NextResponse.json({ items })
  } catch (err: any) {
    console.error('generate-checklist failed:', err)
    return NextResponse.json(
      { error: 'Failed to generate checklist' },
      { status: 500 }
    )
  }
}
