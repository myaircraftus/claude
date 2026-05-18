/**
 * POST /api/intelligence/missing-records
 *
 * Missing Records Detector — the most safety-critical Aircraft Intelligence
 * module. Runs 8 gap/anomaly checks over an aircraft's uploaded records and
 * returns severity-ranked findings.
 *
 * Posture: CONSERVATIVE. When a RAG query returns evidence that is ambiguous
 * we still surface a finding — a false positive ("look again") is far safer
 * than a false negative on aircraft maintenance records. Checks backed by RAG
 * are skipped entirely when there are zero retrieved chunks (chunkCount===0)
 * so we never fabricate a gap with no evidence behind it.
 *
 * Owner / admin only — the shop persona is blocked (403).
 *
 * Body:  { aircraft_id: string, regenerate?: boolean }
 * Reply: { module:'missing-records', aircraft_id, generated_at, cached, data }
 *        data = { empty:true }  — no documents uploaded yet
 *        data = { findings: [...], counts: { critical, warning, info } }
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { getCurrentPersona } from '@/lib/persona/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { readIntelligenceCache, writeIntelligenceCache } from '@/lib/intelligence/cache'
import { scoreIntelligenceReport } from '@/lib/intelligence/quality-score'
import { runIntelligenceQuery } from '@/lib/rag/intelligence-query'
import type {
  IntelligenceCitation,
  IntelligenceReport,
  IntelligenceSeverity,
} from '@/lib/intelligence/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

interface MissingRecordFinding {
  id: string
  severity: IntelligenceSeverity
  title: string
  detail: string
  why_it_matters: string
  what_to_look_for: string
  citations: IntelligenceCitation[]
}

/**
 * Heuristic gap detector. The RAG answer is plain English, so we look for the
 * affirmative gap/anomaly language each prompt is designed to elicit. Erring
 * conservative: if the answer is non-empty and not a clean "no gaps" reply we
 * keep the finding so a human reviews it.
 */
function answerIndicatesProblem(answer: string): boolean {
  const text = (answer || '').toLowerCase().trim()
  if (!text) return false
  // Clear all-clear language → no finding.
  const clear = [
    'no gap', 'no gaps', 'no unusual', 'no unexplained', 'no large jump',
    'no prop strike', 'no propeller strike', 'no missing', 'none found',
    'no discrepanc', 'no anomal', 'no issues', 'all annuals are',
    'consecutive annuals', 'no evidence of', 'not find any', 'no form 337 gap',
    'no overhaul', 'no stc without',
  ]
  // If the answer explicitly says everything checks out, suppress.
  const looksClear = clear.some((p) => text.includes(p))
  // Affirmative problem language always wins (conservative bias).
  const problem = [
    'gap', 'missing', 'unexplained', 'no subsequent', 'no corresponding',
    'no matching', 'no form 337', 'without a form 337', 'no teardown',
    'no inspection', 'discrepan', 'anomal', 'jump', 'exceeds', 'longer than',
    'unable to locate', 'not documented', 'not found', 'no logbook',
  ]
  const looksProblem = problem.some((p) => text.includes(p))
  if (looksProblem && !looksClear) return true
  // Ambiguous (problem words AND clear words, or neither): stay conservative
  // only when there is some problem signal.
  return looksProblem
}

export async function POST(req: NextRequest) {
  // --- Auth ---------------------------------------------------------------
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let persona: 'owner' | 'shop' | 'admin' = 'owner'
  try {
    persona = (await getCurrentPersona()).persona
  } catch {
    // defensive — resolveRequestOrgContext already proved a session exists
  }
  if (persona === 'shop') {
    return NextResponse.json(
      { error: 'Aircraft Intelligence is owner-only.' },
      { status: 403 },
    )
  }

  // --- Body ---------------------------------------------------------------
  let body: { aircraft_id?: string; regenerate?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const aircraftId = (body.aircraft_id ?? '').trim()
  const regenerate = body.regenerate === true
  if (!aircraftId) {
    return NextResponse.json({ error: 'aircraft_id is required.' }, { status: 400 })
  }

  const orgId = ctx.organizationId
  const supabase = createServiceSupabase()

  // --- Verify aircraft ∈ org ---------------------------------------------
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id')
    .eq('id', aircraftId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found.' }, { status: 404 })
  }

  // --- Cache --------------------------------------------------------------
  if (!regenerate) {
    const cached = await readIntelligenceCache(supabase, aircraftId, 'missing-records')
    if (cached) {
      return NextResponse.json({
        ...(cached.result_json as Record<string, unknown>),
        cached: true,
        generated_at: cached.generated_at,
      })
    }
  }

  // --- Document inventory -------------------------------------------------
  const { data: docs } = await supabase
    .from('documents')
    .select('id, title, doc_type, document_subtype')
    .eq('organization_id', orgId)
    .eq('aircraft_id', aircraftId)
    .is('deleted_at', null)

  const documents = (docs ?? []) as Array<{
    id: string
    title: string | null
    doc_type: string | null
    document_subtype: string | null
  }>

  if (documents.length === 0) {
    const emptyReport = {
      module: 'missing-records' as const,
      aircraft_id: aircraftId,
      generated_at: new Date().toISOString(),
      cached: false,
      data: { empty: true },
    }
    return NextResponse.json(emptyReport)
  }

  const findings: MissingRecordFinding[] = []

  // ======================================================================
  // RAG-backed checks (1, 2, 5, 6, 7, 8). chunkCount===0 → skip silently.
  // ======================================================================

  // Check 1 — Annual inspection gaps (critical: gap > 13 months).
  try {
    const r = await runIntelligenceQuery({
      organizationId: orgId,
      aircraftId,
      question:
        'List every annual inspection date in chronological order; identify any calendar gap longer than 12 months between consecutive annuals.',
      strategy: 'tree',
    })
    if (r.chunkCount > 0 && answerIndicatesProblem(r.answer)) {
      findings.push({
        id: 'annual-inspection-gap',
        severity: 'critical',
        title: 'Possible gap in annual inspection history',
        detail: r.answer,
        why_it_matters:
          'An aircraft is not airworthy without a current annual inspection. A calendar gap longer than ~13 months between annuals means either the aircraft was grounded or an annual logbook entry is missing — both require resolution before flight.',
        what_to_look_for:
          'A signed annual inspection logbook entry for each gap year, with the IA certificate number, date, and tach/Hobbs reading. If the aircraft was genuinely not flown, look for a written statement to that effect.',
        citations: r.citations,
      })
    }
  } catch {
    /* runIntelligenceQuery never throws, but stay defensive */
  }

  // Check 2 — Tach hour gaps (warning: unexplained jump > 200 hours).
  try {
    const r = await runIntelligenceQuery({
      organizationId: orgId,
      aircraftId,
      question:
        'List tach readings chronologically and identify any unusually large jump in tach time with no maintenance entries in between.',
      strategy: 'tree',
    })
    if (r.chunkCount > 0 && answerIndicatesProblem(r.answer)) {
      findings.push({
        id: 'tach-hour-gap',
        severity: 'warning',
        title: 'Unexplained jump in tach time',
        detail: r.answer,
        why_it_matters:
          'A large tach jump (roughly 200+ hours) with no maintenance entries in between usually means a logbook covering that period is missing. Time-in-service drives every inspection, overhaul, and life-limited-part interval, so an undocumented stretch of hours undermines the whole compliance picture.',
        what_to_look_for:
          'The logbook(s) covering the missing hours, or a tach/Hobbs replacement entry that explains the discontinuity (with the old and new readings recorded).',
        citations: r.citations,
      })
    }
  } catch {
    /* defensive */
  }

  // Check 5 — Missing post-strike inspection (critical).
  try {
    const r = await runIntelligenceQuery({
      organizationId: orgId,
      aircraftId,
      question:
        'Is there any prop strike documented, and if so, is there a subsequent propeller or engine teardown/inspection logbook entry?',
      strategy: 'hybrid_all',
    })
    if (r.chunkCount > 0 && answerIndicatesProblem(r.answer)) {
      findings.push({
        id: 'missing-post-strike-inspection',
        severity: 'critical',
        title: 'Prop strike with no documented follow-up inspection',
        detail: r.answer,
        why_it_matters:
          'A propeller strike can damage the engine crankshaft and accessory gears. The engine manufacturer mandates a teardown or inspection after a strike. Flying without documented compliance is a serious airworthiness and safety risk.',
        what_to_look_for:
          'An engine teardown or crankshaft/gear inspection logbook entry dated after the prop strike, signed by an A&P/IA, referencing the applicable manufacturer service bulletin.',
        citations: r.citations,
      })
    }
  } catch {
    /* defensive */
  }

  // Check 6 — STC without Form 337 (warning).
  try {
    const r = await runIntelligenceQuery({
      organizationId: orgId,
      aircraftId,
      question:
        'For each STC in the records, is there a corresponding Form 337 with a proximate date?',
      strategy: 'bm25',
    })
    if (r.chunkCount > 0 && answerIndicatesProblem(r.answer)) {
      findings.push({
        id: 'stc-without-337',
        severity: 'warning',
        title: 'STC with no matching Form 337',
        detail: r.answer,
        why_it_matters:
          'An STC installation is a major alteration and must be recorded on an FAA Form 337. A missing 337 leaves the alteration undocumented for the FAA and can complicate insurance, resale, and future maintenance.',
        what_to_look_for:
          'A completed FAA Form 337 dated close to each STC installation, listing the STC number and signed by the installer. Confirm the 337 is also on file with the FAA Aircraft Registry.',
        citations: r.citations,
      })
    }
  } catch {
    /* defensive */
  }

  // Check 7 — Same IA every year (info — noted, not a flag).
  try {
    const r = await runIntelligenceQuery({
      organizationId: orgId,
      aircraftId,
      question:
        'Are the last 3+ annual inspections all signed by the same IA?',
      strategy: 'tree',
    })
    if (r.chunkCount > 0 && answerIndicatesProblem(r.answer)) {
      findings.push({
        id: 'same-ia-every-year',
        severity: 'info',
        title: 'Recent annuals all signed by the same IA',
        detail: r.answer,
        why_it_matters:
          'This is not a defect — it is simply a pattern worth noting. A single recurring IA can mean a consistent, well-known maintenance relationship, but it also means any systemic oversight would not have been caught by a second set of eyes.',
        what_to_look_for:
          'Consider whether a fresh IA for an upcoming annual would add value. No records action is required.',
        citations: r.citations,
      })
    }
  } catch {
    /* defensive */
  }

  // Check 8 — Engine overhaul without log entry (critical).
  try {
    const r = await runIntelligenceQuery({
      organizationId: orgId,
      aircraftId,
      question:
        'Does any STC or Form 337 reference an engine overhaul that has no matching logbook entry with the same date or tach?',
      strategy: 'hybrid_all',
    })
    if (r.chunkCount > 0 && answerIndicatesProblem(r.answer)) {
      findings.push({
        id: 'engine-overhaul-no-log-entry',
        severity: 'critical',
        title: 'Engine overhaul referenced with no matching logbook entry',
        detail: r.answer,
        why_it_matters:
          'If a Form 337 or STC paperwork references an engine overhaul but no logbook entry records it, the time-since-major-overhaul (SMOH) cannot be substantiated. SMOH is fundamental to valuation, TBO tracking, and airworthiness.',
        what_to_look_for:
          'The engine logbook entry for the overhaul — date, tach/total time, the shop or A&P that performed it, and a yellow tag or 8130-3 for overhauled accessories.',
        citations: r.citations,
      })
    }
  } catch {
    /* defensive */
  }

  // ======================================================================
  // Direct-DB document-presence checks (3, 4). No RAG — just inventory.
  // ======================================================================

  const hasEngineLogbook = documents.some(
    (d) => d.doc_type === 'logbook' && d.document_subtype === 'engine_logbook',
  )
  const hasPropLogbook = documents.some(
    (d) => d.doc_type === 'logbook' && d.document_subtype === 'prop_logbook',
  )
  const hasAirframeLogbook = documents.some(
    (d) => d.doc_type === 'logbook' && d.document_subtype === 'airframe_logbook',
  )
  const hasAnyLogbook = documents.some((d) => d.doc_type === 'logbook')

  // Check 3 — Engine logbook missing (critical).
  // Conservative: flag whenever no engine logbook doc exists. If airframe
  // records are present the airframe almost certainly references engine work,
  // so a missing engine logbook is a genuine gap.
  if (!hasEngineLogbook) {
    findings.push({
      id: 'engine-logbook-missing',
      severity: 'critical',
      title: 'No engine logbook on file',
      detail: hasAirframeLogbook || hasAnyLogbook
        ? 'The uploaded records include airframe/other logbooks but no document is classified as an engine logbook. Engine maintenance, overhauls, and AD compliance are recorded in a separate engine logbook.'
        : 'No document in this aircraft’s records is classified as an engine logbook.',
      why_it_matters:
        'The engine logbook is the primary record of engine time, overhauls, cylinder work, and engine-specific AD compliance. Without it, time-since-major-overhaul and engine airworthiness cannot be established — a critical gap for any owner, buyer, or mechanic.',
      what_to_look_for:
        'A standalone engine logbook covering the current engine from its last overhaul (or new) to the present. If it exists on paper, scan and upload it; if it is genuinely lost, a reconstruction signed by an IA may be required.',
      citations: [],
    })
  }

  // Check 4 — Prop logbook missing (warning).
  if (!hasPropLogbook) {
    findings.push({
      id: 'prop-logbook-missing',
      severity: 'warning',
      title: 'No propeller logbook on file',
      detail:
        'No document in this aircraft’s records is classified as a propeller logbook.',
      why_it_matters:
        'The propeller logbook records prop overhauls, AD compliance, and any prop-strike inspections. A missing prop logbook makes time-since-prop-overhaul and recurring prop AD status impossible to verify.',
      what_to_look_for:
        'A standalone propeller logbook covering the current prop. For fixed-pitch props some history may live in the airframe log — confirm where prop overhaul and AD entries are recorded.',
      citations: [],
    })
  }

  // --- Assemble + cache ---------------------------------------------------
  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  }

  const report: IntelligenceReport<{
    findings: MissingRecordFinding[]
    counts: { critical: number; warning: number; info: number }
  }> = {
    module: 'missing-records',
    aircraft_id: aircraftId,
    generated_at: new Date().toISOString(),
    cached: false,
    data: { findings, counts },
  }

  // Attach the deterministic quality self-score before caching/returning.
  report.quality_score = scoreIntelligenceReport(report)

  await writeIntelligenceCache(supabase, {
    aircraftId,
    orgId,
    module: 'missing-records',
    result: report as unknown as Record<string, unknown>,
  })

  return NextResponse.json(report)
}
