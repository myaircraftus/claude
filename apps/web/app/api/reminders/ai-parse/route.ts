import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildOperationProfile } from '@/lib/aircraft/operations'

const VALID_TYPES = new Set([
  'annual',
  '100hr',
  'transponder',
  'elt',
  'static_pitot',
  'vor',
  'ad_compliance',
  'custom',
])

const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'critical'])

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

function safeJsonParse(content: string) {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  return JSON.parse(cleaned)
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const aircraftId = typeof body.aircraft_id === 'string' ? body.aircraft_id : null

  if (!prompt) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  let aircraftContext: string | null = null
  if (aircraftId) {
    const { data: aircraft } = await supabase
      .from('aircraft')
      .select('id, tail_number, make, model, year, operation_types')
      .eq('id', aircraftId)
      .eq('organization_id', membership.organization_id)
      .single()

    if (aircraft) {
      const profile = buildOperationProfile(aircraft.operation_types)
      aircraftContext = [
        `Tail: ${aircraft.tail_number}`,
        `Make/model: ${aircraft.make} ${aircraft.model}`,
        aircraft.year ? `Year: ${aircraft.year}` : null,
        profile.labels.length > 0 ? `Operation profile: ${profile.labels.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    }
  }

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'You convert plain-English aircraft maintenance reminder requests into structured JSON. Return only valid JSON with keys: reminder_type, title, description, due_date, due_hours, priority. Use reminder_type one of annual, 100hr, transponder, elt, static_pitot, vor, ad_compliance, custom. Use priority one of low, normal, high, critical. due_date must be YYYY-MM-DD if provided. due_hours must be a number if provided. When the user asks for a reminder that cannot be mapped precisely, use custom.',
        },
        {
          role: 'user',
          content: [
            `Today is ${new Date().toISOString().slice(0, 10)}.`,
            aircraftContext ? `Aircraft context:\n${aircraftContext}` : null,
            `User request:\n${prompt}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      max_tokens: 300,
    })

    const content = completion.choices[0]?.message?.content?.trim() ?? '{}'
    const parsed = safeJsonParse(content)

    const reminder_type = VALID_TYPES.has(parsed.reminder_type) ? parsed.reminder_type : 'custom'
    const priority = VALID_PRIORITIES.has(parsed.priority) ? parsed.priority : 'normal'
    const due_date = typeof parsed.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date)
      ? parsed.due_date
      : undefined
    const due_hours = typeof parsed.due_hours === 'number'
      ? parsed.due_hours
      : typeof parsed.due_hours === 'string' && parsed.due_hours.trim() !== ''
      ? Number(parsed.due_hours)
      : undefined

    return NextResponse.json({
      aircraft_id: aircraftId,
      reminder_type,
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : prompt,
      description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
      due_date,
      due_hours: Number.isFinite(due_hours) ? due_hours : undefined,
      priority,
    })
  } catch (error: any) {
    console.error('[POST /api/reminders/ai-parse] failed', error)
    return NextResponse.json(
      { error: error.message ?? 'Failed to parse reminder' },
      { status: 500 }
    )
  }
}
