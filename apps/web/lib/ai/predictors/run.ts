/**
 * Predictor orchestrator (Spec 5.3).
 *
 * Runs the 3 heuristic predictors in parallel for a given aircraft,
 * filters out insufficient-data results, and (optionally) narrates each
 * surviving prediction via Claude — used for the AI Inbox card body.
 *
 * The narrate path is opt-in via `narrate=true`; the cron uses it, the
 * read-only API does not (cheaper). When ANTHROPIC_API_KEY is missing
 * or the call fails, narrate falls back to the predictor's headline +
 * first evidence string.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { callAnthropic } from '@/lib/ai/anthropic'
import { predictCompressionTrend } from './compression-trend'
import { predictOilConsumption } from './oil-consumption'
import { predictComponentFailure } from './component-failure'
import type { PredictionResult } from './types'

export interface RunPredictorsInput {
  organization_id: string
  aircraft_id: string
  /** Run Claude to rewrite each prediction body in plain English. Default false. */
  narrate?: boolean
  /** Required when narrate=true — used by ai_activity_log row. */
  user_id?: string | null
}

export async function runAircraftPredictors(
  supabase: SupabaseClient,
  input: RunPredictorsInput,
): Promise<Array<PredictionResult & { narrated_body?: string }>> {
  const [comp, oil, comps] = await Promise.all([
    predictCompressionTrend(supabase, input).catch((e) => failed('compression-trend', e)),
    predictOilConsumption(supabase, input).catch((e) => failed('oil-consumption', e)),
    predictComponentFailure(supabase, input).catch((e) => failed('component-failure', e)),
  ])
  const all = [comp, oil, comps].filter((p): p is PredictionResult => !!p && !p.insufficientData && p.confidence >= 0.5)

  if (!input.narrate || all.length === 0) return all

  const narrated: Array<PredictionResult & { narrated_body?: string }> = []
  for (const p of all) {
    let body: string | undefined
    try {
      const result = await callAnthropic(supabase, {
        system: 'You are an aviation maintenance assistant. Rewrite the prediction in 1-2 sentences, plain English, owner-second-person voice. NO invented FAR/AD/SB references. NO part numbers or vendor names beyond what is given.',
        user: JSON.stringify({ headline: p.headline, evidence: p.evidence, priority: p.priority }),
        max_tokens: 200,
        temperature: 0.2,
      }, {
        organization_id: input.organization_id,
        user_id: input.user_id ?? null,
        scope: `predictor:${p.kind}`,
        entity_kind: 'aircraft',
        entity_id: input.aircraft_id,
        context: { kind: p.kind, priority: p.priority },
      })
      body = result.text.trim().slice(0, 800)
    } catch {
      body = undefined
    }
    narrated.push({ ...p, narrated_body: body })
  }
  return narrated
}

function failed(kind: PredictionResult['kind'], err: unknown): PredictionResult {
  return {
    kind,
    headline: `${kind} predictor errored — ${err instanceof Error ? err.message : 'unknown'}`,
    evidence: [],
    priority: 'low',
    confidence: 0,
    insufficientData: true,
  }
}
