/**
 * POST /api/intelligence/ad-traceability
 *
 * AD / SB Traceability module of the Aircraft Intelligence Suite. Surfaces
 * every Airworthiness Directive mentioned in the aircraft's uploaded records,
 * maps each to compliance evidence, and flags recurring ADs that may be
 * overdue. We do NOT connect to the FAA AD database — this analyzes only what
 * is documented in the uploaded records.
 *
 * Pipeline:
 *   1. runIntelligenceQuery (hybrid_all) — pull a free-text AD summary.
 *   2. A second gpt-4o-mini JSON call extracts a structured AD array.
 *   3. Recurring ADs get a computed next_due + status.
 *
 * Owner/admin only — the shop persona is 403'd. Results are cached 24h.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { generateLlmObject } from '@/lib/ai/llm'
import { getCurrentPersona } from '@/lib/persona/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { runIntelligenceQuery } from '@/lib/rag/intelligence-query'
import { readIntelligenceCache, writeIntelligenceCache } from '@/lib/intelligence/cache'
import { scoreIntelligenceReport } from '@/lib/intelligence/quality-score'
import type { IntelligenceCitation, IntelligenceReport } from '@/lib/intelligence/types'
import {
  type ExtractedAd,
  type TraceabilityAd,
  classifyAd,
  coerceExtractedAd,
} from '@/lib/intelligence/ad-classify'

// Migrated to the unified AI SDK layer (lib/ai/llm).

export const dynamic = 'force-dynamic'

const DISCLAIMER =
  'Based on uploaded maintenance records. Does not substitute for an official FAA AD compliance review.'

// AD types + the pure classification / date-validation logic now live in
// @/lib/intelligence/ad-classify (imported above) so they can be unit-tested
// without pulling in this route's server dependencies.

/**
 * Second LLM pass: turn the free-text AD summary into a structured array.
 * Defensive — any failure (no key, bad JSON, wrong shape) yields [].
 */
async function extractAds(answer: string): Promise<ExtractedAd[]> {
  if (!answer.trim() || !process.env.OPENAI_API_KEY) return []

  try {
    // Permissive schema — ads is a loose passthrough array; the per-item
    // coercion below is unchanged (mirrors the prior loose JSON.parse).
    const AdsSchema = z.object({
      ads: z.array(z.record(z.unknown())).nullish(),
    })

    const { object: parsed } = await generateLlmObject({
      model: 'gpt-4o-mini',
      schema: AdsSchema,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(20000),
      temperature: 0,
      system:
        'You extract Airworthiness Directive (AD) records from an aircraft maintenance ' +
        'summary. Respond ONLY with JSON of the form {"ads":[{...}]}. Each AD object has: ' +
        '"ad_number" (string, e.g. "2019-12-04"), "type" ("one-time" or "recurring"), ' +
        '"complied" (boolean — true only when the records show this AD was actually complied ' +
        'with; false if the records indicate it was not complied with or compliance is unclear), ' +
        '"last_compliance_date" (a real calendar date as "YYYY-MM-DD" with a full 4-digit year; ' +
        'use null when the year is not documented — NEVER output a placeholder such as ' +
        '"YYYY-06-20" and never guess or invent a year), ' +
        '"recurring_interval_months" (integer months for recurring ADs, else null), ' +
        '"evidence_excerpt" (short quote from the records documenting compliance, or ""). ' +
        'Only include ADs explicitly mentioned in the text. Never invent ADs or dates. ' +
        'If no ADs are present, return {"ads":[]}.',
      prompt: `Maintenance records AD summary:\n\n${answer}`,
    })

    const list = parsed.ads
    if (!Array.isArray(list)) return []

    const out: ExtractedAd[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const ad = coerceExtractedAd(item as Record<string, unknown>)
      if (ad) out.push(ad)
    }
    return out
  } catch (err) {
    console.error('[ad-traceability] AD extraction failed:', err)
    return []
  }
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Owner-only — the shop persona must not run analysis over private records.
  try {
    const { persona } = await getCurrentPersona()
    if (persona === 'shop') {
      return NextResponse.json({ error: 'Aircraft Intelligence is owner-only' }, { status: 403 })
    }
  } catch {
    // defensive — context already proved an authenticated membership
  }

  const body = (await req.json().catch(() => null)) as
    | { aircraft_id?: string; regenerate?: boolean }
    | null
  const aircraftId = typeof body?.aircraft_id === 'string' ? body.aircraft_id : ''
  const regenerate = body?.regenerate === true
  if (!aircraftId) {
    return NextResponse.json({ error: 'aircraft_id is required' }, { status: 400 })
  }

  const supabase = createServiceSupabase()

  // Verify the aircraft belongs to the caller's organization.
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id')
    .eq('id', aircraftId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }

  // Serve from cache unless the caller forced a regenerate.
  if (!regenerate) {
    const cached = await readIntelligenceCache(supabase, aircraftId, 'ad-traceability')
    if (cached) {
      return NextResponse.json({ ...cached.result_json, cached: true })
    }
  }

  // No uploaded documents — nothing to analyze.
  const { count: docCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('aircraft_id', aircraftId)
    .is('deleted_at', null)
  if (!docCount || docCount === 0) {
    return NextResponse.json({
      module: 'ad-traceability',
      aircraft_id: aircraftId,
      generated_at: new Date().toISOString(),
      cached: false,
      data: { empty: true },
    })
  }

  // Step 1 — pull a free-text AD summary from the records.
  const query = await runIntelligenceQuery({
    organizationId: ctx.organizationId,
    aircraftId,
    question:
      'List every airworthiness directive mentioned in these maintenance records with its ' +
      'compliance date, whether it is one-time or recurring, the recurring interval if ' +
      'stated, and the logbook entry text documenting compliance.',
    strategy: 'hybrid_all',
  })

  // Step 2 — structured extraction. Step 3 — classify + compute due dates.
  const extracted = await extractAds(query.answer)
  const ads: TraceabilityAd[] = extracted.map(classifyAd)
  const citations: IntelligenceCitation[] = query.citations

  const result: IntelligenceReport<{
    disclaimer: string
    ads: TraceabilityAd[]
    citations: IntelligenceCitation[]
  }> = {
    module: 'ad-traceability',
    aircraft_id: aircraftId,
    generated_at: new Date().toISOString(),
    cached: false,
    data: {
      disclaimer: DISCLAIMER,
      ads,
      citations,
    },
  }

  // Attach the deterministic quality self-score before caching/returning.
  result.quality_score = scoreIntelligenceReport(result)

  await writeIntelligenceCache(supabase, {
    aircraftId,
    orgId: ctx.organizationId,
    module: 'ad-traceability',
    result: result as unknown as Record<string, unknown>,
  })

  return NextResponse.json(result)
}
