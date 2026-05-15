import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabase } from '@/lib/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

type StructuredSeverity = 'Low' | 'Medium' | 'High' | 'Critical'

function inferCategory(text: string) {
  const normalized = text.toLowerCase()
  if (/(brake|caliper|pedal|rotor|disc|taxi)/.test(normalized)) return 'Landing Gear / Brakes'
  if (/(light|alternator|voltage|electrical|battery|starter|bus|wiring)/.test(normalized)) return 'Avionics / Electrical'
  if (/(fuel|tank|cap|selector|leak)/.test(normalized)) return 'Fuel System'
  if (/(oil|engine|cylinder|mag|spark plug|rough running|compress)/.test(normalized)) return 'Engine'
  if (/(prop|governor)/.test(normalized)) return 'Propeller'
  if (/(tire|wheel|gear|strut)/.test(normalized)) return 'Landing Gear'
  if (/(door|window|seat|cabin|interior)/.test(normalized)) return 'Cabin / Interior'
  if (/(elt|emergency)/.test(normalized)) return 'Emergency Equipment'
  return 'General'
}

function inferSuggestedTaxonomy(text: string) {
  const normalized = text.toLowerCase()
  const match = (ata: string, jasc: string, confidence: 'medium' | 'low' = 'medium') => ({
    suggested_ata_code: ata,
    suggested_jasc_code: jasc,
    classification_source: 'suggested',
    classification_confidence: confidence,
    classification_status: 'suggested',
  })

  if (/(brake|caliper|pedal|rotor|disc)/.test(normalized)) return match('32', '3240')
  if (/(tire|wheel|gear|strut)/.test(normalized)) return match('32', '3200', 'low')
  if (/(transponder)/.test(normalized)) return match('34', '3452')
  if (/(radio|comm|intercom|audio panel)/.test(normalized)) return match('23', '2300')
  if (/(battery|charger)/.test(normalized)) return match('24', '2432')
  if (/(alternator|generator)/.test(normalized)) return match('24', '2434')
  if (/(wire|wiring|electrical short|bus|circuit breaker)/.test(normalized)) return match('24', '2497', 'low')
  if (/(electrical|voltage|starter)/.test(normalized)) return match('24', '2400', 'low')
  if (/(fuel|tank|cap|selector|leak)/.test(normalized)) return match('28', '2800', 'low')
  if (/(spark plug|igniter)/.test(normalized)) return match('74', '7421')
  if (/(magneto|mag )/.test(normalized)) return match('74', '7414')
  if (/(ignition)/.test(normalized)) return match('74', '7400', 'low')
  if (/(oil pressure|oil temp|oil temperature|oil leak|oil filter|oil)/.test(normalized)) return match('79', '7900', 'low')
  if (/(prop governor)/.test(normalized)) return match('61', '6122')
  if (/(prop|propeller)/.test(normalized)) return match('61', '6100', 'low')
  if (/(engine|cylinder|rough running|compress)/.test(normalized)) return match('71', '7100', 'low')

  return {
    suggested_ata_code: null,
    suggested_jasc_code: null,
    classification_source: 'suggested',
    classification_confidence: 'unknown',
    classification_status: 'unclassified',
  }
}

function inferSeverity(text: string, grounded: boolean): StructuredSeverity {
  const normalized = text.toLowerCase()
  if (grounded) return 'Critical'
  if (/(grounded|unsafe|not airworthy|won't start|will not start|engine failure|fuel leak|brake failure|fire)/.test(normalized)) return 'Critical'
  if (/(dragging|grinding|alternator|soft brake|oil leak|rough running|intermittent loss)/.test(normalized)) return 'High'
  if (/(flicker|wear|approaching|slight|minor|odor|smell)/.test(normalized)) return 'Medium'
  return 'Low'
}

function heuristicStructure(text: string, grounded: boolean) {
  const trimmed = text.trim()
  const firstLine = trimmed.split(/\n+/)[0] ?? trimmed
  const firstSentence = firstLine.split(/[.!?]+/)[0]?.trim() || 'New squawk'
  const category = inferCategory(trimmed)
  const severity = inferSeverity(trimmed, grounded)
  return {
    title: firstSentence.slice(0, 96),
    description: trimmed,
    category,
    system: category,
    severity,
    grounded: grounded || severity === 'Critical',
    structuredBy: 'heuristic',
    ...inferSuggestedTaxonomy(trimmed),
  }
}

export async function POST(req: NextRequest) {
  // OpenAI cost — rate-limit per IP (security-audit §5.8).
  const rl = rateLimit(`squawks-structure:${getClientIp(req.headers)}`, { limit: 10, windowSeconds: 60 })
  if (!rl.success) return rateLimitResponse(rl)

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const text = String(body?.text ?? '').trim()
  const grounded = Boolean(body?.grounded)

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const fallback = heuristicStructure(text, grounded)
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(fallback)
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You structure aircraft discrepancy reports into maintenance squawks. Return only valid JSON with keys: title, description, category, system, severity, grounded. Severity must be one of Low, Medium, High, Critical.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            text,
            grounded,
            aircraft: body?.aircraft ?? null,
            tail_number: body?.tail_number ?? null,
          }),
        },
      ],
      max_tokens: 300,
    })

    const content = response.choices[0]?.message?.content?.trim() ?? ''
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    const severity = ['Low', 'Medium', 'High', 'Critical'].includes(parsed?.severity)
      ? parsed.severity
      : fallback.severity

    return NextResponse.json({
      title: String(parsed?.title ?? fallback.title).slice(0, 96),
      description: String(parsed?.description ?? fallback.description),
      category: String(parsed?.category ?? fallback.category),
      system: String(parsed?.system ?? parsed?.category ?? fallback.system),
      severity,
      grounded: Boolean((parsed?.grounded ?? grounded) || severity === 'Critical'),
      structuredBy: 'ai',
      ...inferSuggestedTaxonomy(text),
    })
  } catch (error) {
    console.error('Squawk structure failed, falling back to heuristics:', error)
    return NextResponse.json(fallback)
  }
}
