/**
 * POST /api/work-orders/[id]/ai-summary
 *
 * Aggregates everything the mechanic touched on the WO and returns an
 * editable plain-language summary. This summary is the source-of-truth
 * narrative that drives:
 *   - the auto-generated invoice line items / notes
 *   - the auto-generated logbook entry description
 *
 * Inputs the LLM gets:
 *   - WO header (number, status, complaint, discrepancy, findings, corrective action)
 *   - Completed checklist items (especially AD/SB resolutions w/ refs)
 *   - All line items (parts + labor + outside services)
 *   - Recent activity messages (so timer-logged labor + chat updates flow in)
 *
 * Output:
 *   { summary: string, generated_at: string }
 *
 * The summary is also persisted to work_orders.ai_summary so reloads keep
 * the latest version. Returns 503 if OPENAI_API_KEY isn't set so the UI
 * can show a graceful "AI not configured" hint.
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const SYSTEM_PROMPT = `You are an A&P mechanic writing the wrap-up summary for a maintenance work order.
Your output will be used as the source for two artifacts: (1) the customer-facing invoice notes
and (2) the FAA-compliant logbook entry description (14 CFR 43.9 / 43.11 format).

Write a single concise summary (3–6 sentences) covering:
- What was reported / discrepancy
- What was found
- What was done (corrective action) — fold in parts replaced and labor performed
- Any AD/SB items resolved (cite by number)
- Aircraft return-to-service status

Style: past tense, technical but readable, no marketing language. Do NOT include the WO number,
aircraft tail, or date — those are stored separately. Output ONLY the summary text, no headings.`

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'AI summary not configured (OPENAI_API_KEY missing)', code: 'SERVICE_NOT_CONFIGURED' },
      { status: 503 }
    )
  }

  const ip = getClientIp(req.headers)
  const rl = rateLimit(`wo-summary:${ip}`, { limit: 8, windowSeconds: 60 })
  if (!rl.success) return rateLimitResponse(rl)

  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  // ─── Pull WO + line items + checklist (messages fetched after we have thread_id) ─
  const [woRes, linesRes, checklistRes] = await Promise.all([
    supabase
      .from('work_orders')
      .select(`
        id, work_order_number, status, complaint, discrepancy, findings,
        corrective_action, troubleshooting_notes, thread_id,
        aircraft:aircraft_id (id, tail_number, make, model, year, engine_make, engine_model)
      `)
      .eq('id', params.id)
      .eq('organization_id', orgId)
      .single(),
    supabase
      .from('work_order_lines')
      .select('id, line_type, description, part_number, quantity, unit_price, hours, rate, sort_order')
      .eq('work_order_id', params.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('work_order_checklist_items')
      .select('item_label, item_description, source, source_reference, required, completed, completed_at')
      .eq('work_order_id', params.id)
      .order('sort_order', { ascending: true }),
  ])
  // Messages live on the WO's thread; only fetch when a thread exists.
  let msgsRes: { data: any[] | null } = { data: [] }
  if ((woRes.data as any)?.thread_id) {
    msgsRes = await supabase
      .from('thread_messages')
      .select('content, intent, created_at')
      .eq('thread_id', (woRes.data as any).thread_id)
      .order('created_at', { ascending: true })
      .limit(50)
  }

  if (woRes.error || !woRes.data) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }
  const wo = woRes.data as any
  const lines = (linesRes.data ?? []) as any[]
  const checklist = (checklistRes.data ?? []) as any[]
  const messages = (msgsRes.data ?? []) as any[]

  // ─── Build the prompt ──────────────────────────────────────────
  const aircraft = Array.isArray(wo.aircraft) ? wo.aircraft[0] : wo.aircraft
  const acLine = aircraft
    ? [aircraft.year, aircraft.make, aircraft.model, aircraft.tail_number ? `(${aircraft.tail_number})` : '']
        .filter(Boolean).join(' ')
    : 'aircraft'
  const engineLine = aircraft?.engine_make || aircraft?.engine_model
    ? `Engine: ${[aircraft.engine_make, aircraft.engine_model].filter(Boolean).join(' ')}`
    : ''

  const completed = checklist.filter((c) => c.completed)
  const adsbResolved = completed.filter((c) => c.source === 'ad_sb' || c.source === 'ad')
  const checklistText = completed.length === 0
    ? 'None completed yet.'
    : completed.map((c) => {
        const ref = c.source_reference ? ` [${c.source_reference}]` : ''
        return `- ✓ ${c.item_label}${ref}`
      }).join('\n')

  const partLines = lines.filter((l) => l.line_type === 'part')
  const laborLines = lines.filter((l) => l.line_type === 'labor')
  const outsideLines = lines.filter((l) => l.line_type === 'outside_service')

  const partsText = partLines.length === 0
    ? 'None.'
    : partLines.map((p) => {
        const pn = p.part_number ? `${p.part_number} — ` : ''
        const qty = p.quantity ? ` (×${p.quantity})` : ''
        return `- ${pn}${p.description}${qty}`
      }).join('\n')

  const laborText = laborLines.length === 0
    ? 'None.'
    : laborLines.map((l) => `- ${l.description} (${l.hours ?? l.quantity ?? 0}h)`).join('\n')

  const outsideText = outsideLines.length === 0
    ? ''
    : 'Outside services:\n' + outsideLines.map((o) => `- ${o.description}`).join('\n')

  const recentActivity = messages
    .filter((m) => m.content && (m.intent === 'system_event' || (typeof m.content === 'string' && m.content.length < 240)))
    .slice(-12)
    .map((m) => `- ${m.content}`)
    .join('\n')

  const userPrompt = [
    `Aircraft: ${acLine}`,
    engineLine,
    `Customer complaint: ${wo.complaint || '(none recorded)'}`,
    wo.discrepancy ? `Discrepancy: ${wo.discrepancy}` : '',
    wo.findings ? `Findings: ${wo.findings}` : '',
    wo.troubleshooting_notes ? `Troubleshooting: ${wo.troubleshooting_notes}` : '',
    wo.corrective_action ? `Corrective action: ${wo.corrective_action}` : '',
    '',
    `Completed checklist (${completed.length}/${checklist.length}):`,
    checklistText,
    adsbResolved.length > 0 ? `\nAD/SB items resolved: ${adsbResolved.map((a) => a.source_reference).filter(Boolean).join(', ')}` : '',
    '',
    `Parts:`,
    partsText,
    '',
    `Labor:`,
    laborText,
    '',
    outsideText,
    '',
    recentActivity ? `Recent activity:\n${recentActivity}` : '',
  ].filter(Boolean).join('\n')

  // ─── LLM call ──────────────────────────────────────────────────
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o',
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    })

    const summary = (completion.choices[0]?.message?.content ?? '').trim()
    if (!summary) {
      return NextResponse.json({ error: 'AI returned empty summary' }, { status: 502 })
    }

    const generated_at = new Date().toISOString()
    await supabase
      .from('work_orders')
      .update({ ai_summary: summary, ai_summary_generated_at: generated_at })
      .eq('id', params.id)
      .eq('organization_id', orgId)

    return NextResponse.json({
      summary,
      generated_at,
      stats: {
        checklist_total: checklist.length,
        checklist_completed: completed.length,
        adsb_resolved: adsbResolved.length,
        line_items_count: lines.length,
        parts_count: partLines.length,
        labor_count: laborLines.length,
      },
    })
  } catch (err: any) {
    console.error('[ai-summary] failed:', err?.message)
    return NextResponse.json({ error: 'AI summary generation failed' }, { status: 500 })
  }
}
