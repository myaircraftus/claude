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
import OpenAI from 'openai'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { getCurrentPersona } from '@/lib/persona/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { runIntelligenceQuery } from '@/lib/rag/intelligence-query'
import { readIntelligenceCache, writeIntelligenceCache } from '@/lib/intelligence/cache'
import type { IntelligenceCitation } from '@/lib/intelligence/types'

export const dynamic = 'force-dynamic'

const DISCLAIMER =
  'Based on uploaded maintenance records. Does not substitute for an official FAA AD compliance review.'

type AdType = 'one-time' | 'recurring'
type AdStatus = 'complied' | 'recurring' | 'overdue' | 'no-evidence'

/** One structured AD extracted from the step-1 RAG answer. */
interface ExtractedAd {
  ad_number: string
  type: AdType
  last_compliance_date: string | null
  recurring_interval_months: number | null
  evidence_excerpt: string
}

/** The final shape rendered by the client. */
interface TraceabilityAd {
  ad_number: string
  type: AdType
  last_compliance_date: string | null
  next_due: string | null
  evidence_excerpt: string
  status: AdStatus
}

/** Add a whole number of months to an ISO date, clamping day overflow. */
function addMonths(isoDate: string, months: number): string | null {
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + months)
  // Clamp Feb-30 style overflow back to the last day of the target month.
  if (d.getUTCDate() < day) d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}

/**
 * Second LLM pass: turn the free-text AD summary into a structured array.
 * Defensive — any failure (no key, bad JSON, wrong shape) yields [].
 */
async function extractAds(answer: string): Promise<ExtractedAd[]> {
  if (!answer.trim() || !process.env.OPENAI_API_KEY) return []

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000, maxRetries: 1 })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract Airworthiness Directive (AD) records from an aircraft maintenance ' +
            'summary. Respond ONLY with JSON of the form {"ads":[{...}]}. Each AD object has: ' +
            '"ad_number" (string, e.g. "2019-12-04"), "type" ("one-time" or "recurring"), ' +
            '"last_compliance_date" (ISO date "YYYY-MM-DD" or null if no date is documented), ' +
            '"recurring_interval_months" (integer months for recurring ADs, else null), ' +
            '"evidence_excerpt" (short quote from the records documenting compliance, or ""). ' +
            'Only include ADs explicitly mentioned in the text. Never invent ADs or dates. ' +
            'If no ADs are present, return {"ads":[]}.',
        },
        { role: 'user', content: `Maintenance records AD summary:\n\n${answer}` },
      ],
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as unknown
    const list = (parsed as { ads?: unknown })?.ads
    if (!Array.isArray(list)) return []

    const out: ExtractedAd[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const adNumber = typeof row.ad_number === 'string' ? row.ad_number.trim() : ''
      if (!adNumber) continue
      const type: AdType = row.type === 'recurring' ? 'recurring' : 'one-time'
      const lastDate =
        typeof row.last_compliance_date === 'string' && row.last_compliance_date.trim()
          ? row.last_compliance_date.trim()
          : null
      const intervalRaw = Number(row.recurring_interval_months)
      const interval =
        Number.isFinite(intervalRaw) && intervalRaw > 0 ? Math.round(intervalRaw) : null
      out.push({
        ad_number: adNumber,
        type,
        last_compliance_date: lastDate,
        recurring_interval_months: interval,
        evidence_excerpt:
          typeof row.evidence_excerpt === 'string' ? row.evidence_excerpt.slice(0, 600) : '',
      })
    }
    return out
  } catch (err) {
    console.error('[ad-traceability] AD extraction failed:', err)
    return []
  }
}

/** Compute next_due + status for one extracted AD. */
function classifyAd(ad: ExtractedAd): TraceabilityAd {
  let nextDue: string | null = null
  let status: AdStatus

  if (!ad.last_compliance_date) {
    status = 'no-evidence'
  } else if (ad.type === 'recurring' && ad.recurring_interval_months) {
    nextDue = addMonths(ad.last_compliance_date, ad.recurring_interval_months)
    const isPast = nextDue != null && new Date(nextDue).getTime() < Date.now()
    status = isPast ? 'overdue' : 'recurring'
  } else {
    // one-time AD with a documented compliance date, or recurring w/o interval.
    status = ad.type === 'recurring' ? 'recurring' : 'complied'
  }

  return {
    ad_number: ad.ad_number,
    type: ad.type,
    last_compliance_date: ad.last_compliance_date,
    next_due: nextDue,
    evidence_excerpt: ad.evidence_excerpt,
    status,
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

  const result = {
    module: 'ad-traceability' as const,
    aircraft_id: aircraftId,
    generated_at: new Date().toISOString(),
    cached: false,
    data: {
      disclaimer: DISCLAIMER,
      ads,
      citations,
    },
  }

  await writeIntelligenceCache(supabase, {
    aircraftId,
    orgId: ctx.organizationId,
    module: 'ad-traceability',
    result,
  })

  return NextResponse.json(result)
}
