/**
 * POST /api/intelligence/prebuy — the Prebuy Report module of the Aircraft
 * Intelligence Suite.
 *
 * Runs a neutral, flags-focused pre-purchase evaluation over an aircraft's
 * uploaded records: 5 routed RAG queries (logbook continuity, engine/prop,
 * damage, ADs, STCs) + 1 direct-Supabase records-completeness check, then
 * rolls everything up into a GREEN / YELLOW / RED risk score.
 *
 * Owner + admin only — the shop persona is rejected (403). Results are cached
 * for 24h via intelligence_cache; pass `regenerate:true` to bypass the cache.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { getCurrentPersona } from '@/lib/persona/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { runIntelligenceQuery } from '@/lib/rag/intelligence-query'
import { readIntelligenceCache, writeIntelligenceCache } from '@/lib/intelligence/cache'
import { scoreIntelligenceReport } from '@/lib/intelligence/quality-score'
import type {
  IntelligenceCitation,
  IntelligenceReport,
  IntelligenceStatus,
  IntelligenceRisk,
} from '@/lib/intelligence/types'
import type { QueryStrategy } from '@/lib/rag/query-router'

export const dynamic = 'force-dynamic'

interface PrebuySection {
  id: string
  title: string
  status: IntelligenceStatus
  summary: string
  citations: IntelligenceCitation[]
}

/**
 * Derive a section status from an AI answer's language. Conservative: gap /
 * missing / concern wording → 'flag'; partial / verify wording → 'review';
 * otherwise 'pass'. Empty answers fall through to 'review' (not enough to
 * confirm a clean result).
 */
function deriveStatus(answer: string): IntelligenceStatus {
  const text = (answer || '').toLowerCase()
  if (!text.trim()) return 'review'

  const flagSignals = [
    'gap', 'missing', 'no annual', 'not signed', 'unsigned', 'absent',
    'no record', 'not documented', 'undocumented', 'concern', 'discrepan',
    'prop strike', 'propeller strike', 'lightning strike', 'hard landing',
    'damage history', 'accident', 'insurance claim', 'not present',
    'no evidence', 'lacking', 'incomplete', 'no form 337', 'no logbook',
  ]
  const reviewSignals = [
    'partial', 'verify', 'unclear', 'cannot confirm', "couldn't confirm",
    'unable to confirm', 'should be confirmed', 'recommend', 'inconclusive',
    'ambiguous', 'further review', 'not fully', 'appears', 'may be',
    'insufficient', 'limited records', 'requires inspection',
  ]

  if (flagSignals.some((s) => text.includes(s))) return 'flag'
  if (reviewSignals.some((s) => text.includes(s))) return 'review'
  return 'pass'
}

/** A RAG-backed prebuy section: run the query, derive status from the answer. */
async function ragSection(
  id: string,
  title: string,
  question: string,
  strategy: QueryStrategy,
  ctx: { organizationId: string; aircraftId: string },
): Promise<PrebuySection> {
  const result = await runIntelligenceQuery({
    organizationId: ctx.organizationId,
    aircraftId: ctx.aircraftId,
    question,
    strategy,
  })

  if (result.chunkCount === 0) {
    return {
      id,
      title,
      status: 'review',
      summary:
        'Insufficient records to analyze this area. Upload more of this ' +
        "aircraft's logbooks and maintenance records, then re-run the analysis.",
      citations: [],
    }
  }

  return {
    id,
    title,
    status: deriveStatus(result.answer),
    summary: result.answer.trim(),
    citations: result.citations,
  }
}

/**
 * Section 6 — Records Completeness. Direct Supabase: check which record
 * families are present among this aircraft's documents. A missing logbook is
 * a flag; other missing record types are a review-level note.
 */
async function recordsCompletenessSection(
  supabase: ReturnType<typeof createServiceSupabase>,
  aircraftId: string,
): Promise<PrebuySection> {
  const { data: rows } = await supabase
    .from('documents')
    .select('doc_type, document_subtype, title')
    .eq('aircraft_id', aircraftId)
    .is('deleted_at', null)

  const docs = (rows ?? []) as Array<{
    doc_type: string | null
    document_subtype: string | null
    title: string | null
  }>

  // Build a lowercase haystack of every type/subtype/title signal.
  const haystack = docs
    .map((d) =>
      `${d.doc_type ?? ''} ${d.document_subtype ?? ''} ${d.title ?? ''}`.toLowerCase(),
    )
    .join(' | ')

  const REQUIRED: Array<{ label: string; isLogbook: boolean; match: RegExp }> = [
    { label: 'Airframe logbook', isLogbook: true, match: /\b(airframe|aircraft)\b.*\blog|airframe log/ },
    { label: 'Engine logbook', isLogbook: true, match: /\bengine\b.*\blog|engine log/ },
    { label: 'Propeller logbook', isLogbook: true, match: /\b(prop|propeller)\b.*\blog|prop log/ },
    { label: 'STC paperwork', isLogbook: false, match: /\bstc\b|supplemental type/ },
    { label: 'Form 337', isLogbook: false, match: /\b337\b|form 337/ },
    { label: 'POH / AFM', isLogbook: false, match: /\bpoh\b|\bafm\b|pilot.?s operating|flight manual/ },
  ]

  // A generic logbook with no airframe/engine/prop qualifier still counts.
  const hasGenericLogbook = docs.some((d) => (d.doc_type ?? '').toLowerCase() === 'logbook')

  const present: string[] = []
  const missing: string[] = []
  let logbookMissing = false

  for (const req of REQUIRED) {
    const found =
      req.match.test(haystack) || (req.isLogbook && hasGenericLogbook)
    if (found) {
      present.push(req.label)
    } else {
      missing.push(req.label)
      if (req.isLogbook) logbookMissing = true
    }
  }

  const status: IntelligenceStatus = logbookMissing
    ? 'flag'
    : missing.length > 0
      ? 'review'
      : 'pass'

  const summaryParts: string[] = []
  summaryParts.push(
    present.length > 0
      ? `Present in the uploaded records: ${present.join(', ')}.`
      : 'No standard record types were positively identified in the uploaded documents.',
  )
  if (missing.length > 0) {
    summaryParts.push(
      `Not found: ${missing.join(', ')}. ` +
        (logbookMissing
          ? 'A missing logbook is a significant gap for a prebuy — request it from the seller.'
          : 'These records should be requested from the seller before purchase.'),
    )
  } else {
    summaryParts.push('All standard prebuy record types appear to be present.')
  }

  return {
    id: 'records-completeness',
    title: 'Records Completeness',
    status,
    summary: summaryParts.join(' '),
    citations: [],
  }
}

/**
 * Section 7 — Overall Risk Score. Pure roll-up over the six analysis
 * sections: any 'flag' → red; otherwise two-or-more 'review' → yellow;
 * otherwise green.
 */
function overallRiskSection(sections: PrebuySection[]): {
  section: PrebuySection
  risk: IntelligenceRisk
  flagCount: number
  reviewCount: number
} {
  const flagCount = sections.filter((s) => s.status === 'flag').length
  const reviewCount = sections.filter((s) => s.status === 'review').length

  const risk: IntelligenceRisk =
    flagCount > 0 ? 'red' : reviewCount >= 2 ? 'yellow' : 'green'

  const headline =
    risk === 'red'
      ? 'Elevated risk — one or more areas were flagged as concerns.'
      : risk === 'yellow'
        ? 'Moderate risk — several areas warrant a closer look before purchase.'
        : 'Low risk — no concerns were flagged across the reviewed areas.'

  const summary =
    `${headline} ${flagCount} item${flagCount === 1 ? '' : 's'} flagged as ` +
    `concern${flagCount === 1 ? '' : 's'}, ${reviewCount} flagged for review. ` +
    'This is an automated, records-based screen and does not replace a ' +
    'physical prebuy inspection by a qualified mechanic.'

  return {
    section: {
      id: 'overall-risk',
      title: 'Overall Risk Score',
      status: flagCount > 0 ? 'flag' : reviewCount >= 2 ? 'review' : 'pass',
      summary,
      citations: [],
    },
    risk,
    flagCount,
    reviewCount,
  }
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { persona } = await getCurrentPersona()
    if (persona === 'shop') {
      return NextResponse.json(
        { error: 'Aircraft Intelligence is owner-only.' },
        { status: 403 },
      )
    }
  } catch {
    return NextResponse.json(
      { error: 'Aircraft Intelligence is owner-only.' },
      { status: 403 },
    )
  }

  // ── Request body ──────────────────────────────────────────────────────
  let body: { aircraft_id?: string; regenerate?: boolean }
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const aircraftId = body.aircraft_id
  const regenerate = body.regenerate === true
  if (!aircraftId) {
    return NextResponse.json({ error: 'aircraft_id is required.' }, { status: 400 })
  }

  const supabase = createServiceSupabase()

  // ── Verify the aircraft belongs to the caller's org ───────────────────
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id')
    .eq('id', aircraftId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found.' }, { status: 404 })
  }

  // ── Cache hit (unless regenerating) ───────────────────────────────────
  if (!regenerate) {
    const cached = await readIntelligenceCache(supabase, aircraftId, 'prebuy')
    if (cached) {
      return NextResponse.json({ ...cached.result_json, cached: true })
    }
  }

  // ── No documents → empty report ───────────────────────────────────────
  const { count: docCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('aircraft_id', aircraftId)
    .is('deleted_at', null)

  if (!docCount || docCount === 0) {
    const emptyReport = {
      module: 'prebuy' as const,
      aircraft_id: aircraftId,
      generated_at: new Date().toISOString(),
      cached: false,
      data: { empty: true },
    }
    return NextResponse.json(emptyReport)
  }

  // ── Build the 7 sections ──────────────────────────────────────────────
  const queryCtx = { organizationId: ctx.organizationId, aircraftId }

  const [logbook, engineProp, damage, ads, stc] = await Promise.all([
    ragSection(
      'logbook-continuity',
      'Logbook Continuity',
      'Find any gaps in logbook entries, missing signatures, unsigned entries, or years with no annual inspection.',
      'tree',
      queryCtx,
    ),
    ragSection(
      'engine-prop-health',
      'Engine & Prop Health',
      "What is the engine time since overhaul, the manufacturer's published TBO for this engine type, and has there been any prop strike or abnormal cylinder/compression/borescope finding?",
      'hybrid_all',
      queryCtx,
    ),
    ragSection(
      'damage-history',
      'Damage History',
      'Find any damage, accidents, hard landings, prop/lightning strikes, insurance claims, or accident reports.',
      'hybrid_vb',
      queryCtx,
    ),
    ragSection(
      'ad-compliance',
      'AD Compliance',
      'Are recurring ADs documented at every required interval? Are any ADs marked not-applicable, and is the rationale present?',
      'hybrid_all',
      queryCtx,
    ),
    ragSection(
      'stc-modification',
      'STC & Modification Consistency',
      'For each STC, is there a corresponding Form 337 and logbook entry? Are STC eligibility limits consistent with the aircraft serial number?',
      'bm25',
      queryCtx,
    ),
  ])

  const records = await recordsCompletenessSection(supabase, aircraftId)

  const analysisSections: PrebuySection[] = [
    logbook,
    engineProp,
    damage,
    ads,
    stc,
    records,
  ]

  const { section: overall, risk, flagCount, reviewCount } =
    overallRiskSection(analysisSections)

  const report: IntelligenceReport<{
    risk: IntelligenceRisk
    flagCount: number
    reviewCount: number
    sections: PrebuySection[]
  }> = {
    module: 'prebuy',
    aircraft_id: aircraftId,
    generated_at: new Date().toISOString(),
    cached: false,
    data: {
      risk,
      flagCount,
      reviewCount,
      sections: [...analysisSections, overall],
    },
  }

  // Attach the deterministic quality self-score before caching/returning.
  report.quality_score = scoreIntelligenceReport(report)

  await writeIntelligenceCache(supabase, {
    aircraftId,
    orgId: ctx.organizationId,
    module: 'prebuy',
    result: report as unknown as Record<string, unknown>,
  })

  return NextResponse.json(report)
}
