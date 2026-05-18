/**
 * POST /api/intelligence/history — Full History Package module of the
 * Aircraft Intelligence Suite.
 *
 * Assembles a complete, source-cited maintenance history from this
 * aircraft's uploaded records: identity, inspection timeline, AD compliance,
 * damage history, current status, and document completeness. Owner-only —
 * the shop persona is blocked. Results are cached for 24h in
 * intelligence_cache; pass `regenerate: true` to bypass.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { getCurrentPersona } from '@/lib/persona/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { runIntelligenceQuery } from '@/lib/rag/intelligence-query'
import { readIntelligenceCache, writeIntelligenceCache } from '@/lib/intelligence/cache'
import { scoreIntelligenceReport } from '@/lib/intelligence/quality-score'
import type { IntelligenceCitation, IntelligenceReport } from '@/lib/intelligence/types'

export const dynamic = 'force-dynamic'

/** One narrative section of the report — text + the citations behind it. */
interface HistorySection {
  text: string
  citations: IntelligenceCitation[]
}

/** Module-specific `data` payload of the history IntelligenceReport. */
interface HistoryData {
  empty?: boolean
  identity?: HistorySection & {
    header: {
      tail_number: string | null
      serial_number: string | null
      make: string | null
      model: string | null
      year: number | null
      total_time_hours: number | null
    }
  }
  timeline?: HistorySection & {
    annuals: HistorySection
    overhauls: HistorySection
    hundred_hour: HistorySection
  }
  ad_compliance?: HistorySection
  damage?: HistorySection
  current_status?: HistorySection & {
    open_squawks: Array<{ id: string; title: string; severity: string | null; status: string | null }>
  }
  document_completeness?: {
    present: string[]
    missing: string[]
    doc_types: string[]
  }
}

/** Required document categories the completeness check looks for. */
const REQUIRED_DOCS: Array<{ label: string; matches: string[] }> = [
  { label: 'Airframe Logbook', matches: ['logbook'] },
  { label: 'Engine Logbook', matches: ['logbook'] },
  { label: 'Prop Logbook', matches: ['logbook'] },
  { label: 'STC', matches: ['stc'] },
  { label: 'Form 337', matches: ['form_337'] },
  { label: 'POH', matches: ['poh', 'afm'] },
]

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
  let body: { aircraft_id?: unknown; regenerate?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const aircraftId = typeof body.aircraft_id === 'string' ? body.aircraft_id : ''
  const regenerate = body.regenerate === true
  if (!aircraftId) {
    return NextResponse.json({ error: 'aircraft_id is required' }, { status: 400 })
  }

  const supabase = createServiceSupabase()

  // --- Verify the aircraft belongs to this org ----------------------------
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, serial_number, make, model, year, total_time_hours')
    .eq('id', aircraftId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }
  const ac = aircraft as {
    id: string
    tail_number: string | null
    serial_number: string | null
    make: string | null
    model: string | null
    year: number | null
    total_time_hours: number | null
  }

  // --- Cache hit -----------------------------------------------------------
  if (!regenerate) {
    const cached = await readIntelligenceCache(supabase, aircraftId, 'history')
    if (cached) {
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
    const emptyReport: IntelligenceReport<HistoryData> = {
      module: 'history',
      aircraft_id: aircraftId,
      generated_at: new Date().toISOString(),
      data: { empty: true },
      cached: false,
    }
    return NextResponse.json(emptyReport)
  }

  // --- Run the section queries --------------------------------------------
  const q = (question: string, strategy: Parameters<typeof runIntelligenceQuery>[0]['strategy']) =>
    runIntelligenceQuery({ organizationId, aircraftId, question, strategy })

  const [
    identityRes,
    annualsRes,
    overhaulsRes,
    hundredHourRes,
    adRes,
    damageRes,
    statusRes,
  ] = await Promise.all([
    q(
      'Aircraft registration, serial number, total airframe time, engine time, prop time. ' +
        'List all STCs with STC numbers and all Form 337s with dates and descriptions.',
      'hybrid_all',
    ),
    q('List all annual inspections with dates, tach readings, and IA signatures', 'tree'),
    q(
      'List all engine overhauls, prop overhauls, prop strikes, and cylinder work with dates and tach.',
      'tree',
    ),
    q('List all 100-hour inspections.', 'tree'),
    q(
      'List all airworthiness directive compliance entries, note which are recurring ' +
        'and their last compliance date.',
      'hybrid_all',
    ),
    q(
      'Find any references to damage, accidents, hard landings, prop strikes, or lightning strikes.',
      'hybrid_vb',
    ),
    q('What is the current annual inspection status and expiration date', 'tree'),
  ])

  // --- Current Status: open squawks (direct query) ------------------------
  const { data: squawkRows } = await supabase
    .from('squawks')
    .select('id, title, severity, status')
    .eq('aircraft_id', aircraftId)
    .not('status', 'in', '("resolved","closed","verified")')
    .order('reported_at', { ascending: false })

  const openSquawks = ((squawkRows as Array<Record<string, any>>) ?? []).map((s) => ({
    id: String(s.id),
    title: String(s.title ?? 'Untitled squawk'),
    severity: s.severity ?? null,
    status: s.status ?? null,
  }))

  // --- Document Completeness (direct query) -------------------------------
  const { data: docRows } = await supabase
    .from('documents')
    .select('doc_type')
    .eq('aircraft_id', aircraftId)
    .is('deleted_at', null)

  const docTypes = Array.from(
    new Set(
      ((docRows as Array<Record<string, any>>) ?? [])
        .map((d) => (typeof d.doc_type === 'string' ? d.doc_type.toLowerCase() : ''))
        .filter(Boolean),
    ),
  )
  const present: string[] = []
  const missing: string[] = []
  for (const req of REQUIRED_DOCS) {
    if (req.matches.some((m) => docTypes.includes(m))) present.push(req.label)
    else missing.push(req.label)
  }

  // --- Assemble the report -------------------------------------------------
  const data: HistoryData = {
    identity: {
      text: identityRes.answer,
      citations: identityRes.citations,
      header: {
        tail_number: ac.tail_number,
        serial_number: ac.serial_number,
        make: ac.make,
        model: ac.model,
        year: ac.year,
        total_time_hours: ac.total_time_hours,
      },
    },
    timeline: {
      text:
        'Inspection and major-maintenance timeline reconstructed from the airframe, ' +
        'engine, and propeller logbooks.',
      citations: [...annualsRes.citations, ...overhaulsRes.citations, ...hundredHourRes.citations],
      annuals: { text: annualsRes.answer, citations: annualsRes.citations },
      overhauls: { text: overhaulsRes.answer, citations: overhaulsRes.citations },
      hundred_hour: { text: hundredHourRes.answer, citations: hundredHourRes.citations },
    },
    ad_compliance: { text: adRes.answer, citations: adRes.citations },
    damage: { text: damageRes.answer, citations: damageRes.citations },
    current_status: {
      text: statusRes.answer,
      citations: statusRes.citations,
      open_squawks: openSquawks,
    },
    document_completeness: {
      present,
      missing,
      doc_types: docTypes,
    },
  }

  const report: IntelligenceReport<HistoryData> = {
    module: 'history',
    aircraft_id: aircraftId,
    generated_at: new Date().toISOString(),
    data,
    cached: false,
  }

  // Attach the deterministic quality self-score before caching/returning.
  report.quality_score = scoreIntelligenceReport(report)

  await writeIntelligenceCache(supabase, {
    aircraftId,
    orgId: organizationId,
    module: 'history',
    result: report as unknown as Record<string, unknown>,
  })

  return NextResponse.json(report)
}
