/**
 * POST /api/intelligence/market-value — Market Value Estimate module of the
 * Aircraft Intelligence Suite.
 *
 * Produces an AI-generated value RANGE (not an appraisal) for an aircraft by
 * starting from a make/model/year base range — derived from the model's
 * training-data knowledge — and adjusting it for airframe/engine time, record
 * quality (reusing the cached Prebuy flags), avionics tier, and condition.
 *
 * Owner + admin only — the shop persona is blocked (403). Results are cached
 * for 24h via intelligence_cache; pass `regenerate:true` to bypass. The
 * adjustment inputs (avionics/condition) are part of the cache payload so a
 * change to either re-POSTs and re-runs the estimate.
 */
import { NextResponse, type NextRequest } from 'next/server'
import OpenAI from 'openai'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { getCurrentPersona } from '@/lib/persona/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { runIntelligenceQuery } from '@/lib/rag/intelligence-query'
import { readIntelligenceCache, writeIntelligenceCache } from '@/lib/intelligence/cache'
import type { IntelligenceCitation, IntelligenceReport } from '@/lib/intelligence/types'

export const dynamic = 'force-dynamic'

/** Mandatory disclaimer shown everywhere this estimate appears. */
const DISCLAIMER =
  'This is an AI-generated estimate for planning purposes only. It is not an ' +
  'appraisal. For a certified aircraft appraisal contact an ASA-accredited ' +
  "aircraft appraiser or use Vref, Aircraft Bluebook, or AOPA's Value Tool."

type AvionicsTier = 'basic_vfr' | 'ifr' | 'glass'
type Condition = 'excellent' | 'good' | 'fair' | 'poor'

/** One line of the value-adjustment breakdown table. */
interface ValueAdjustment {
  label: string
  effect: string
}

/** Module-specific `data` payload of the market-value IntelligenceReport. */
interface MarketValueData {
  empty?: boolean
  disclaimer: string
  profile: {
    make: string | null
    model: string | null
    year: number | null
    engine: string | null
    ttaf: number | null
    smoh: string
    spoh: string
    avionics: AvionicsTier
    condition: Condition
  }
  base: { low: number; high: number }
  adjustments: ValueAdjustment[]
  estimate: { low: number; high: number }
  comps_note: string
  value_factors: Array<{ label: string; detail: string }>
  citations: IntelligenceCitation[]
}

/** Pull the first integer-ish number of hours out of a free-text RAG answer. */
function extractHours(text: string, ...keywords: string[]): number | null {
  if (!text) return null
  const lower = text.toLowerCase()
  for (const kw of keywords) {
    const idx = lower.indexOf(kw)
    if (idx === -1) continue
    // Look for a number within ~60 chars after the keyword.
    const window = text.slice(idx, idx + 80)
    const m = window.match(/([\d,]+(?:\.\d+)?)\s*(?:hours|hrs|hr)\b/i)
    if (m) {
      const n = Number(m[1].replace(/,/g, ''))
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  // --- Auth: org context + owner-only persona gate -------------------------
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { organizationId } = ctx

  try {
    const { persona } = await getCurrentPersona()
    if (persona === 'shop') {
      return NextResponse.json(
        { error: 'Aircraft Intelligence is owner-only.' },
        { status: 403 },
      )
    }
  } catch {
    // defensive — resolveRequestOrgContext already proved a session
  }

  // --- Body ----------------------------------------------------------------
  let body: {
    aircraft_id?: unknown
    regenerate?: unknown
    avionics?: unknown
    condition?: unknown
  } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const aircraftId = typeof body.aircraft_id === 'string' ? body.aircraft_id : ''
  const regenerate = body.regenerate === true
  const avionics: AvionicsTier =
    body.avionics === 'basic_vfr' || body.avionics === 'glass' ? body.avionics : 'ifr'
  const condition: Condition =
    body.condition === 'excellent' ||
    body.condition === 'fair' ||
    body.condition === 'poor'
      ? body.condition
      : 'good'
  if (!aircraftId) {
    return NextResponse.json({ error: 'aircraft_id is required' }, { status: 400 })
  }

  const supabase = createServiceSupabase()

  // --- Verify the aircraft belongs to this org ----------------------------
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, make, model, year, total_time_hours, engine_make, engine_model')
    .eq('id', aircraftId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }
  const ac = aircraft as {
    id: string
    make: string | null
    model: string | null
    year: number | null
    total_time_hours: number | null
    engine_make: string | null
    engine_model: string | null
  }
  const engine = [ac.engine_make, ac.engine_model].filter(Boolean).join(' ') || null

  // --- Cache hit (keyed on the selected avionics/condition) ---------------
  if (!regenerate) {
    const cached = await readIntelligenceCache(supabase, aircraftId, 'market-value')
    const cachedProfile = (cached?.result_json as any)?.data?.profile
    if (
      cached &&
      cachedProfile?.avionics === avionics &&
      cachedProfile?.condition === condition
    ) {
      return NextResponse.json({ ...cached.result_json, cached: true })
    }
  }

  // --- Empty-state: no documents ------------------------------------------
  const { count: docCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('aircraft_id', aircraftId)
    .is('deleted_at', null)

  if (!docCount || docCount === 0) {
    const emptyReport: IntelligenceReport<MarketValueData> = {
      module: 'market-value',
      aircraft_id: aircraftId,
      generated_at: new Date().toISOString(),
      cached: false,
      data: {
        empty: true,
        disclaimer: DISCLAIMER,
        profile: {
          make: ac.make,
          model: ac.model,
          year: ac.year,
          engine,
          ttaf: ac.total_time_hours ?? null,
          smoh: 'Unknown',
          spoh: 'Unknown',
          avionics,
          condition,
        },
        base: { low: 0, high: 0 },
        adjustments: [],
        estimate: { low: 0, high: 0 },
        comps_note: '',
        value_factors: [],
        citations: [],
      },
    }
    return NextResponse.json(emptyReport)
  }

  // --- Times: airframe / engine SMOH / prop SPOH from the records ----------
  const timesRes = await runIntelligenceQuery({
    organizationId,
    aircraftId,
    question:
      'What is the total time airframe, time since engine overhaul, and time ' +
      'since prop overhaul?',
    strategy: 'tree',
  })

  const ttaf =
    extractHours(timesRes.answer, 'total time', 'airframe', 'ttaf') ??
    ac.total_time_hours ??
    null
  const smohHours = extractHours(
    timesRes.answer,
    'since engine overhaul',
    'since overhaul',
    'smoh',
    'engine overhaul',
  )
  const spohHours = extractHours(
    timesRes.answer,
    'since prop overhaul',
    'prop overhaul',
    'propeller overhaul',
    'spoh',
  )

  // --- Base value range from the model's training knowledge ---------------
  let baseLow = 0
  let baseHigh = 0
  let compsNote =
    'A base value range could not be estimated for this make/model/year. ' +
    'This estimate is based on training data and may not reflect the current market.'

  if (process.env.OPENAI_API_KEY && (ac.make || ac.model)) {
    try {
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 15000,
        maxRetries: 1,
      })
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are an aircraft valuation analyst. Given an aircraft ' +
              'make, model, and year, estimate a typical retail value RANGE ' +
              'in US dollars for a mid-time, average-condition example. ' +
              'Respond ONLY with JSON: {"base_low":NUMBER,"base_high":NUMBER,' +
              '"comps_note":"STRING"}. base_low and base_high are whole ' +
              'dollar amounts (base_high > base_low). comps_note MUST be ' +
              'one or two sentences and MUST state that the estimate is ' +
              'based on training data and may not reflect the current market.',
          },
          {
            role: 'user',
            content:
              `Make: ${ac.make ?? 'Unknown'}\n` +
              `Model: ${ac.model ?? 'Unknown'}\n` +
              `Year: ${ac.year ?? 'Unknown'}\n` +
              (engine ? `Engine: ${engine}\n` : ''),
          },
        ],
      })
      const raw = completion.choices[0]?.message?.content ?? '{}'
      const parsed = JSON.parse(raw) as {
        base_low?: unknown
        base_high?: unknown
        comps_note?: unknown
      }
      const lo = Number(parsed.base_low)
      const hi = Number(parsed.base_high)
      if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo && lo > 0) {
        baseLow = lo
        baseHigh = hi
      }
      if (typeof parsed.comps_note === 'string' && parsed.comps_note.trim()) {
        compsNote = parsed.comps_note.trim()
      }
    } catch {
      // best-effort — fall through to the zero base + default comps_note
    }
  }

  // --- Prebuy flags → value factors ---------------------------------------
  const valueFactors: Array<{ label: string; detail: string }> = []
  let hasRecordFlags = false
  let annualJustCompleted = false
  try {
    const prebuyCache = await readIntelligenceCache(supabase, aircraftId, 'prebuy')
    const sections = (prebuyCache?.result_json as any)?.data?.sections
    if (Array.isArray(sections)) {
      for (const s of sections) {
        if (s?.status === 'flag') {
          hasRecordFlags = true
          valueFactors.push({
            label: String(s.title ?? 'Flagged item'),
            detail: String(s.summary ?? '').slice(0, 280),
          })
        }
      }
    }
  } catch {
    // prebuy cache is optional — no flags means no record-quality penalty
  }

  // Heuristic: a recently completed annual is a small positive factor.
  const timesText = `${timesRes.answer}`.toLowerCase()
  if (
    /annual.*(just|recently) (completed|signed)/.test(timesText) ||
    /(completed|signed).*annual/.test(timesText)
  ) {
    annualJustCompleted = true
  }

  // --- Adjustment breakdown ------------------------------------------------
  const adjustments: ValueAdjustment[] = []
  let pctLow = 0
  let pctHigh = 0
  let flatLow = 0
  let flatHigh = 0

  const TBO = 2000 // typical piston engine TBO when none is documented

  // High-time airframe.
  if (ttaf != null && ttaf >= 5000) {
    pctLow -= 0.15
    pctHigh -= 0.05
    adjustments.push({
      label: `High-time airframe (${Math.round(ttaf).toLocaleString('en-US')} hrs TTAF)`,
      effect: '-5% to -15%',
    })
  }

  // Engine time since overhaul.
  if (smohHours != null && smohHours < 200) {
    pctLow += 0.05
    pctHigh += 0.15
    adjustments.push({
      label: `Low-time engine (${Math.round(smohHours).toLocaleString('en-US')} hrs SMOH)`,
      effect: '+5% to +15%',
    })
  } else if (smohHours != null && smohHours > TBO) {
    pctLow -= 0.2
    pctHigh -= 0.1
    adjustments.push({
      label: `Engine past TBO (${Math.round(smohHours).toLocaleString('en-US')} hrs SMOH, TBO ${TBO.toLocaleString('en-US')})`,
      effect: '-10% to -20%',
    })
  }

  // Avionics tier.
  if (avionics === 'glass') {
    flatLow += 15000
    flatHigh += 30000
    adjustments.push({
      label: 'Glass cockpit avionics',
      effect: '+$15,000 to +$30,000',
    })
  } else if (avionics === 'basic_vfr') {
    pctLow -= 0.08
    pctHigh -= 0.03
    adjustments.push({
      label: 'Basic VFR avionics only',
      effect: '-3% to -8%',
    })
  }

  // Condition.
  if (condition === 'excellent') {
    pctLow += 0.03
    pctHigh += 0.08
    adjustments.push({ label: 'Excellent overall condition', effect: '+3% to +8%' })
  } else if (condition === 'fair') {
    pctLow -= 0.1
    pctHigh -= 0.04
    adjustments.push({ label: 'Fair overall condition', effect: '-4% to -10%' })
  } else if (condition === 'poor') {
    pctLow -= 0.2
    pctHigh -= 0.1
    adjustments.push({ label: 'Poor overall condition', effect: '-10% to -20%' })
  }

  // Record quality (Prebuy flags).
  if (hasRecordFlags) {
    pctLow -= 0.2
    pctHigh -= 0.1
    adjustments.push({
      label: 'Poor records / Prebuy flags present',
      effect: '-10% to -20%',
    })
  }

  // Annual just completed.
  if (annualJustCompleted) {
    flatLow += 1000
    flatHigh += 3000
    adjustments.push({
      label: 'Annual inspection recently completed',
      effect: '+$1,000 to +$3,000',
    })
  }

  // --- Compute the adjusted estimate range --------------------------------
  // Apply the most-negative percentage to the low end and the most-positive
  // to the high end so the resulting range brackets the uncertainty.
  let estLow = baseLow * (1 + pctLow) + flatLow
  let estHigh = baseHigh * (1 + pctHigh) + flatHigh
  estLow = Math.max(0, estLow)
  estHigh = Math.max(estLow, estHigh)

  // --- Assemble the report -------------------------------------------------
  const data: MarketValueData = {
    disclaimer: DISCLAIMER,
    profile: {
      make: ac.make,
      model: ac.model,
      year: ac.year,
      engine,
      ttaf,
      smoh: smohHours != null ? `${Math.round(smohHours).toLocaleString('en-US')} hrs` : 'Unknown',
      spoh: spohHours != null ? `${Math.round(spohHours).toLocaleString('en-US')} hrs` : 'Unknown',
      avionics,
      condition,
    },
    base: { low: Math.round(baseLow), high: Math.round(baseHigh) },
    adjustments,
    estimate: { low: Math.round(estLow), high: Math.round(estHigh) },
    comps_note: compsNote,
    value_factors: valueFactors,
    citations: timesRes.citations,
  }

  const report: IntelligenceReport<MarketValueData> = {
    module: 'market-value',
    aircraft_id: aircraftId,
    generated_at: new Date().toISOString(),
    cached: false,
    data,
  }

  await writeIntelligenceCache(supabase, {
    aircraftId,
    orgId: organizationId,
    module: 'market-value',
    result: report as unknown as Record<string, unknown>,
  })

  return NextResponse.json(report)
}
