/**
 * POST /api/voice/intent  (Spec 5.4)
 *
 * Body: { text: string, context?: { aircraft_id?: string, work_order_id?: string } }
 *
 * Classifies the spoken intent into one of a fixed set of actions and
 * extracts the slots needed to act. Returns the structured intent +
 * confidence; the client decides whether to confirm with the user
 * (always recommended for create-WO / log-meter) or auto-route (for
 * find-part / answer-question).
 *
 * No DB writes — pure classifier. Audit row written via callAnthropic.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { callAnthropic } from '@/lib/ai/anthropic'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SYSTEM_PROMPT = `You are an aviation maintenance intent classifier. Map the user's spoken instruction to ONE of these intents and extract slots:

- create-work-order   {aircraft_tail?, scope?}
- log-meter           {aircraft_tail?, meter: "hobbs"|"tach", value: number}
- find-part           {aircraft_tail?, query: string}
- answer-question     {question: string}
- unknown             {}

Output STRICT JSON, no markdown, no commentary:
{ "intent": "<one of above>", "slots": {...}, "confidence": <0-1>, "confirm_required": <true|false> }

Rules:
- confirm_required=true for create-work-order and log-meter (destructive); false for find-part and answer-question.
- Aircraft tail numbers look like N12345 or G-ABCD; if present in the text, copy as aircraft_tail.
- Numbers in "log 38.5 hobbs" → meter='hobbs', value=38.5.
- If you cannot confidently classify, return intent='unknown' with confidence < 0.4.`

interface Body {
  text?: string
  context?: { aircraft_id?: string; work_order_id?: string }
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  let body: Body
  try { body = (await req.json()) as Body } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const text = (body.text ?? '').trim().slice(0, 800)
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const service = createServiceSupabase()
  try {
    const result = await callAnthropic(service, {
      system: SYSTEM_PROMPT,
      user: JSON.stringify({ utterance: text, context: body.context ?? {} }),
      max_tokens: 300,
      temperature: 0.0,
    }, {
      organization_id: membership.organization_id,
      user_id: user.id,
      scope: 'voice-intent',
      entity_kind: null,
      entity_id: null,
      context: { utterance_len: text.length },
    })
    const parsed = parseIntentJson(result.text)
    return NextResponse.json({
      ...parsed,
      model: result.model,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'classify failed' }, { status: 500 })
  }
}

interface IntentJson {
  intent: string
  slots: Record<string, unknown>
  confidence: number
  confirm_required: boolean
}

function parseIntentJson(text: string): IntentJson {
  const fallback: IntentJson = { intent: 'unknown', slots: {}, confidence: 0, confirm_required: false }
  const trimmed = text.trim()
  const candidate = trimmed.startsWith('{') ? trimmed
    : (trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? null)
  if (!candidate) return fallback
  try {
    const obj = JSON.parse(candidate) as Partial<IntentJson>
    return {
      intent: typeof obj.intent === 'string' ? obj.intent : 'unknown',
      slots: typeof obj.slots === 'object' && obj.slots !== null ? obj.slots as Record<string, unknown> : {},
      confidence: typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0,
      confirm_required: !!obj.confirm_required,
    }
  } catch {
    return fallback
  }
}
