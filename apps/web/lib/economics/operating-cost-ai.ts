/**
 * Owner Economics — AI operating-cost suggester.
 *
 * Given an aircraft (make / model / year / engine) asks OpenAI for a
 * realistic operating-cost estimate for a US private owner. Same client
 * pattern as lib/parts/ai-resolve.ts: bounded timeout + single retry so a
 * slow/hung response can't blow the route's serverless budget. Returns
 * null on any failure (no key, timeout, bad JSON) — callers fall back to
 * an empty form.
 */

import OpenAI from 'openai'

export interface AircraftForCostAI {
  year?: number | null
  make?: string | null
  model?: string | null
  engine?: string | null
}

export interface OperatingCostSuggestion {
  fuel_burn_gph: number | null
  fuel_price_per_gal: number | null
  oil_burn_qph: number | null
  oil_price_per_qt: number | null
  engine_reserve_per_hr: number | null
  prop_reserve_per_hr: number | null
  scheduled_maint_per_hr: number | null
  unscheduled_maint_per_hr: number | null
  insurance_per_year: number | null
  annual_fixed_cost: number | null
  tiedown_per_month: number | null
  expected_annual_hours: number | null
  ai_confidence: 'high' | 'medium' | 'low'
  ai_notes: string
}

const SYSTEM_PROMPT =
  'You are an aircraft operating cost expert. Given an aircraft\'s make, ' +
  'model, year, and engine, estimate realistic operating costs for a ' +
  'private owner in the USA. Return ONLY valid JSON — no explanation text.'

const NUMERIC_FIELDS = [
  'fuel_burn_gph',
  'fuel_price_per_gal',
  'oil_burn_qph',
  'oil_price_per_qt',
  'engine_reserve_per_hr',
  'prop_reserve_per_hr',
  'scheduled_maint_per_hr',
  'unscheduled_maint_per_hr',
  'insurance_per_year',
  'annual_fixed_cost',
  'tiedown_per_month',
  'expected_annual_hours',
] as const

function toNum(v: unknown): number | null {
  const x = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(x) ? x : null
}

export async function suggestOperatingCost(
  aircraft: AircraftForCostAI,
): Promise<OperatingCostSuggestion | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[operating-cost-ai] OPENAI_API_KEY not set — skipping AI suggestion')
    return null
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o'

  const label = [aircraft.year, aircraft.make, aircraft.model]
    .filter(Boolean)
    .join(' ') || 'unknown aircraft'
  const engine = aircraft.engine?.trim() || 'unknown'

  const userMessage = `Aircraft: ${label}, Engine: ${engine}
Return JSON with these exact fields (all numeric, USD):
{
  "fuel_burn_gph": number,
  "fuel_price_per_gal": number,
  "oil_burn_qph": number,
  "oil_price_per_qt": number,
  "engine_reserve_per_hr": number,
  "prop_reserve_per_hr": number,
  "scheduled_maint_per_hr": number,
  "unscheduled_maint_per_hr": number,
  "insurance_per_year": number,
  "annual_fixed_cost": number,
  "tiedown_per_month": number,
  "expected_annual_hours": number,
  "ai_confidence": "high" | "medium" | "low",
  "ai_notes": "one or two sentences explaining the basis for these estimates"
}`

  try {
    const completion = await openai.chat.completions.create(
      {
        model,
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      },
      { timeout: 15000, maxRetries: 1 },
    )

    const raw = completion.choices[0]?.message?.content
    if (!raw) {
      console.error('[operating-cost-ai] empty response from OpenAI')
      return null
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out = {} as OperatingCostSuggestion
    for (const field of NUMERIC_FIELDS) {
      out[field] = toNum(parsed[field])
    }
    const conf = parsed.ai_confidence
    out.ai_confidence =
      conf === 'high' || conf === 'medium' || conf === 'low' ? conf : 'low'
    out.ai_notes = typeof parsed.ai_notes === 'string' ? parsed.ai_notes : ''
    return out
  } catch (err) {
    console.error('[operating-cost-ai] error:', err instanceof Error ? err.message : err)
    return null
  }
}
