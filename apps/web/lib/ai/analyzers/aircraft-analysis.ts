/**
 * Aircraft AI analysis (Spec 7.6).
 *
 * Generates a 3-paragraph plain-English summary of a single aircraft's
 * profitability + standout cost drivers + recommendations. Server-only.
 *
 * Output is structured JSON so the UI can render headline / observations /
 * recommendations as discrete pieces — no Markdown parsing, no HTML.
 *
 * Inputs come from the same data shape /api/aircraft/[id]/operating-cost
 * already collects (sprint 7.4). We don't re-query — caller passes
 * `OperatingCostBreakdown` plus a few aircraft-level fields.
 *
 * Cache: 24h per aircraft, keyed by ai_activity_log.scope='aircraft-analysis'
 * + entity_id. We DON'T add a new cache table — the activity log is already
 * the source of truth for "when did this last run / cost / output". The
 * route reads the latest 'aircraft-analysis' row for the aircraft and
 * returns its `context.output` field if newer than 24h.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { callAnthropic, DEFAULT_MODEL } from '@/lib/ai/anthropic'
import type { OperatingCostBreakdown } from '@/lib/costs/calculator'
import { CATEGORY_LABEL, type CostCategory } from '@/lib/costs/categories'

export interface AircraftAnalysisInput {
  organization_id: string
  user_id?: string | null
  aircraft_id: string
  tail_number: string
  make: string | null
  model: string | null
  year: number | null
  total_time_hours: number | null
  /** YTD or 365d operating-cost breakdown. */
  cost: OperatingCostBreakdown
  /** Annual revenue from rental_rate × hours, when known; else 0. */
  revenue_ytd: number
  /** Recent maintenance event one-line summaries (max 8) for context. */
  recent_maintenance?: string[]
}

export interface AircraftAnalysisOutput {
  headline: string
  observations: string[]
  recommendations: string[]
  /** Echo back the period the analysis covers so the UI can label it. */
  period_label: string
  /** Echo input snapshot the model used so refresh-vs-cached UI is honest. */
  model_used: string
  generated_at: string
  input_tokens: number
  output_tokens: number
  cost_usd_cents: number | null
}

const SYSTEM_PROMPT = `You are an aviation operations analyst writing a short economic summary for a single aircraft.

Output STRICT JSON matching this shape, with NO markdown fences and NO prose outside the JSON:
{
  "headline": "<one-sentence profitability story, plain English, owner-second-person voice>",
  "observations": ["<observation 1>", "<observation 2>", "<observation 3>"],
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"]
}

Rules:
- 3 observations, 3 recommendations. Each <= 200 characters.
- Observations are factual claims grounded in the numbers I give you. Examples: "fuel cost is $X/hour, ~Y% above your 90-day baseline", "engine reserve is funded at default rates because no per-aircraft TBO is set".
- Recommendations are concrete next-actions, not platitudes. Examples: "set rental rate to enable revenue tracking", "log engine_overhaul_reserve cost entries to override default $15/hr reserve".
- Never invent FAR/AD/SB numbers. Never invent specific part numbers, vendor names, or dollar amounts not in the inputs.
- Never make legal, tax, or medical claims. If you would be tempted to, replace with "consult your accountant/AME".
- Never criticize the operator personally — only the data.
- If revenue is $0, frame the recommendation as "set rental rate" rather than "your aircraft is unprofitable".
- If confidence < 0.85, lead with "based on limited data".`

export async function analyzeAircraft(
  supabase: SupabaseClient,
  input: AircraftAnalysisInput,
): Promise<AircraftAnalysisOutput> {
  const period = input.cost.breakdown.period
  const periodLabel = period === '30d' ? '30-day' : period === '90d' ? '90-day' : '12-month'

  // Build a compact, model-friendly user prompt. Keep numbers as numbers
  // so the model doesn't have to parse $-strings; round to 2dp for cents.
  const r2 = (n: number) => Math.round(n * 100) / 100
  const categoryTotals = Object.entries(input.cost.breakdown.categoryTotals)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      category: CATEGORY_LABEL[k as CostCategory] ?? k,
      total_usd: r2(v),
    }))
    .sort((a, b) => b.total_usd - a.total_usd)

  const userPayload = {
    aircraft: {
      tail: input.tail_number,
      make: input.make,
      model: input.model,
      year: input.year,
      total_time_hours: input.total_time_hours,
    },
    period: periodLabel,
    flight_hours_in_period: r2(input.cost.breakdown.flightHours),
    annualized_hours: r2(input.cost.breakdown.annualizedHours),
    revenue_ytd_usd: r2(input.revenue_ytd),
    total_spend_usd: r2(input.cost.breakdown.totalSpend),
    wet_cost_per_hour_usd: r2(input.cost.wetCostPerHour),
    dry_cost_per_hour_usd: r2(input.cost.dryCostPerHour),
    components_per_hour_usd: {
      fuel: r2(input.cost.fuelPerHour),
      oil: r2(input.cost.oilPerHour),
      engine_reserve: r2(input.cost.engineReservePerHour),
      prop_reserve: r2(input.cost.propReservePerHour),
      insurance: r2(input.cost.insurancePerHour),
      hangar: r2(input.cost.hangarPerHour),
      annual_inspection: r2(input.cost.annualInspectionPerHour),
      loan: r2(input.cost.loanPerHour),
      depreciation: r2(input.cost.depreciationPerHour),
      other: r2(input.cost.otherPerHour),
    },
    confidence: input.cost.confidence,
    reserve_assumptions: {
      engine: input.cost.breakdown.engineReserve,
      prop: input.cost.breakdown.propReserve,
    },
    categories_by_total: categoryTotals,
    notes_from_calculator: input.cost.breakdown.notes,
    recent_maintenance: input.recent_maintenance ?? [],
  }

  const result = await callAnthropic(
    supabase,
    {
      system: SYSTEM_PROMPT,
      user: JSON.stringify(userPayload),
      model: DEFAULT_MODEL,
      max_tokens: 800,
      temperature: 0.2,
      timeout_ms: 30_000,
    },
    {
      organization_id: input.organization_id,
      user_id: input.user_id ?? null,
      scope: 'aircraft-analysis',
      entity_kind: 'aircraft',
      entity_id: input.aircraft_id,
      context: {
        period,
        flight_hours: input.cost.breakdown.flightHours,
        // Don't put raw revenue/cost numbers in context — keep PII-free.
      },
    },
  )

  const parsed = parseAnalysisJson(result.text)
  return {
    headline: parsed.headline,
    observations: parsed.observations,
    recommendations: parsed.recommendations,
    period_label: periodLabel,
    model_used: result.model,
    generated_at: new Date().toISOString(),
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    cost_usd_cents: result.cost_usd_cents,
  }
}

interface ParsedJson {
  headline: string
  observations: string[]
  recommendations: string[]
}

function parseAnalysisJson(text: string): ParsedJson {
  const candidate = extractJsonObject(text)
  if (!candidate) {
    return {
      headline: 'AI analysis unavailable — model returned non-JSON output.',
      observations: [],
      recommendations: ['Click Refresh to retry.'],
    }
  }
  try {
    const obj = JSON.parse(candidate) as Partial<ParsedJson>
    return {
      headline: typeof obj.headline === 'string' ? obj.headline : 'No headline returned.',
      observations: Array.isArray(obj.observations) ? obj.observations.filter((s) => typeof s === 'string').slice(0, 5) : [],
      recommendations: Array.isArray(obj.recommendations) ? obj.recommendations.filter((s) => typeof s === 'string').slice(0, 5) : [],
    }
  } catch {
    return {
      headline: 'AI analysis unavailable — JSON parse error.',
      observations: [],
      recommendations: ['Click Refresh to retry.'],
    }
  }
}

function extractJsonObject(s: string): string | null {
  const trimmed = s.trim()
  if (trimmed.startsWith('{')) return trimmed
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence?.[1]) return fence[1].trim()
  const start = trimmed.indexOf('{')
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < trimmed.length; i++) {
    if (trimmed[i] === '{') depth++
    else if (trimmed[i] === '}') {
      depth--
      if (depth === 0) return trimmed.slice(start, i + 1)
    }
  }
  return null
}
