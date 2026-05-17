/**
 * POST /api/intelligence/time-comparison — Airframe / Engine / Prop
 * Comparison module of the Aircraft Intelligence Suite.
 *
 * Cross-references total airframe time (TTAF) against engine time since
 * major overhaul (SMOH) and prop time since overhaul (SPOH), measures each
 * against its published TBO, and surfaces discrepancies — a mid-life engine
 * replacement, a prop time that doesn't track engine time, multiple engine
 * overhauls, or long gaps with no logbook entry. Owner-only — the shop
 * persona is blocked. Results are cached for 24h in intelligence_cache;
 * pass `regenerate: true` to bypass.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { getCurrentPersona } from '@/lib/persona/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { runIntelligenceQuery } from '@/lib/rag/intelligence-query'
import { readIntelligenceCache, writeIntelligenceCache } from '@/lib/intelligence/cache'
import type { IntelligenceCitation, IntelligenceReport } from '@/lib/intelligence/types'

export const dynamic = 'force-dynamic'

/** Default manufacturer TBO when none is found in the records (hours). */
const DEFAULT_ENGINE_TBO = 2000
const DEFAULT_PROP_TBO = 2000

interface Discrepancy {
  title: string
  detail: string
  severity: 'critical' | 'warning' | 'info'
}

interface TimeSinceRow {
  label: string
  hours: number | null
  calendar: string | null
  found: boolean
}

/** Module-specific `data` payload of the time-comparison IntelligenceReport. */
interface TimeComparisonData {
  empty?: boolean
  airframe?: { ttaf: number | null }
  engine?: { smoh: number | null; tbo: number; pct: number | null; install_tach: number | null }
  prop?: { spoh: number | null; tbo: number; pct: number | null }
  discrepancies?: Discrepancy[]
  timeSince?: TimeSinceRow[]
  citations?: IntelligenceCitation[]
}

/** First number-looking token in a string, or null. Tolerates commas. */
function firstNumber(text: string | null | undefined): number | null {
  if (!text) return null
  const m = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/** Percent of TBO consumed, clamped to a sane display range, or null. */
function pctOfTbo(used: number | null, tbo: number): number | null {
  if (used == null || !Number.isFinite(used) || tbo <= 0) return null
  return Math.max(0, Math.round((used / tbo) * 100))
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
    .select('id, tail_number, make, model, total_time_hours, engine_make, engine_model')
    .eq('id', aircraftId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }
  const ac = aircraft as {
    id: string
    tail_number: string | null
    make: string | null
    model: string | null
    total_time_hours: number | null
    engine_make: string | null
    engine_model: string | null
  }

  // --- Cache hit -----------------------------------------------------------
  if (!regenerate) {
    const cached = await readIntelligenceCache(supabase, aircraftId, 'time-comparison')
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
    const emptyReport: IntelligenceReport<TimeComparisonData> = {
      module: 'time-comparison',
      aircraft_id: aircraftId,
      generated_at: new Date().toISOString(),
      data: { empty: true },
      cached: false,
    }
    return NextResponse.json(emptyReport)
  }

  // --- Run the analysis queries (tree strategy) ----------------------------
  const q = (question: string) =>
    runIntelligenceQuery({ organizationId, aircraftId, question, strategy: 'tree' })

  const engineCtx = ac.engine_make || ac.engine_model
    ? ` The engine is a ${[ac.engine_make, ac.engine_model].filter(Boolean).join(' ')}.`
    : ''

  const [
    ttafRes,
    smohRes,
    installRes,
    tboRes,
    spohRes,
    propTboRes,
    multiEngineRes,
    gapRes,
    sinceRes,
  ] = await Promise.all([
    q('What is the total time on the airframe (TTAF)? Give the most recent total airframe hours.'),
    q(
      'What is the engine time since major overhaul (SMOH)? How many hours has the engine ' +
        'run since its last major overhaul or since it was installed?' + engineCtx,
    ),
    q(
      'At what airframe tach or total time was the current engine overhauled or installed? ' +
        'Give the airframe hours at the time of the engine overhaul/installation.',
    ),
    q(
      'What is the manufacturer recommended TBO (time between overhaul) for this engine, ' +
        'in hours?' + engineCtx,
    ),
    q('What is the propeller time since overhaul (SPOH)? Hours on the prop since its last overhaul.'),
    q('What is the manufacturer recommended TBO or overhaul interval for the propeller, in hours?'),
    q(
      'Is there more than one engine overhaul on record for this aircraft? List every engine ' +
        'overhaul or engine replacement with its date and tach.',
    ),
    q(
      'What is the longest continuous period of time with no logbook entry? Identify any gap ' +
        'in the maintenance records.',
    ),
    q(
      'When was the last annual inspection, the last 100-hour inspection, the last cylinder ' +
        'compression check, and the last oil analysis? Give dates and tach readings for each.',
    ),
  ])

  // --- Numeric extraction --------------------------------------------------
  const ttaf = ac.total_time_hours ?? firstNumber(ttafRes.answer)
  const smoh = firstNumber(smohRes.answer)
  const installTach = firstNumber(installRes.answer)
  const engineTbo = firstNumber(tboRes.answer) ?? DEFAULT_ENGINE_TBO
  const spoh = firstNumber(spohRes.answer)
  const propTbo = firstNumber(propTboRes.answer) ?? DEFAULT_PROP_TBO

  const enginePct = pctOfTbo(smoh, engineTbo)
  const propPct = pctOfTbo(spoh, propTbo)

  // --- Discrepancy analysis (computed + AI) -------------------------------
  const discrepancies: Discrepancy[] = []

  // (1) Does engine install tach + SMOH ≈ TTAF?
  if (installTach != null && smoh != null && ttaf != null) {
    const reconstructed = installTach + smoh
    const delta = Math.abs(reconstructed - ttaf)
    if (delta > 50) {
      discrepancies.push({
        title: 'Mid-life engine replacement detected',
        detail:
          `Engine was overhauled/installed at ${installTach.toLocaleString()} airframe hours; ` +
          `the airframe had ${installTach.toLocaleString()} hours prior. ` +
          `Install tach + SMOH (${reconstructed.toLocaleString()}h) differs from current ` +
          `TTAF (${ttaf.toLocaleString()}h) by ${delta.toLocaleString()}h — confirm the engine ` +
          `is not original to the airframe.`,
        severity: 'info',
      })
    }
  } else if (installTach != null && installTach > 0) {
    discrepancies.push({
      title: 'Engine not original to airframe',
      detail:
        `Records indicate the current engine was overhauled or installed at ` +
        `${installTach.toLocaleString()} airframe hours — this engine is not original.`,
      severity: 'info',
    })
  }

  // (2) Does prop time match engine time within ±50h?
  if (spoh != null && smoh != null) {
    const propDelta = Math.abs(spoh - smoh)
    if (propDelta > 50) {
      discrepancies.push({
        title: "Prop time doesn't match engine time",
        detail:
          `Prop time (${spoh.toLocaleString()}h SPOH) doesn't match engine time ` +
          `(${smoh.toLocaleString()}h SMOH) — a difference of ${propDelta.toLocaleString()}h. ` +
          `Possible prop event or separate prop overhaul; review the prop logbook.`,
        severity: 'warning',
      })
    }
  }

  // (3) Multiple engine overhauls on record.
  const multiText = (multiEngineRes.answer || '').toLowerCase()
  const overhaulMentions = (multiText.match(/overhaul|replac|installed/g) || []).length
  if (
    multiEngineRes.chunkCount > 0 &&
    (overhaulMentions >= 2 || /more than one|multiple|two engine|second engine/.test(multiText))
  ) {
    discrepancies.push({
      title: 'Multiple engine overhauls on record',
      detail:
        'More than one engine overhaul or replacement appears in the records. ' +
        'Confirm the current SMOH refers to the most recent overhaul. ' +
        multiEngineRes.answer.trim(),
      severity: 'info',
    })
  }

  // (4) Longest no-entry gap.
  if (gapRes.chunkCount > 0 && gapRes.answer && gapRes.answer.trim()) {
    const gapHours = firstNumber(gapRes.answer)
    discrepancies.push({
      title: 'Gap in maintenance records',
      detail:
        (gapHours != null
          ? `Longest continuous period with no logbook entry: ~${gapHours.toLocaleString()}. `
          : '') + gapRes.answer.trim(),
      severity: gapHours != null && gapHours >= 100 ? 'warning' : 'info',
    })
  }

  // (5) Engine past TBO.
  if (enginePct != null && enginePct >= 100) {
    discrepancies.push({
      title: 'Engine has reached or exceeded TBO',
      detail:
        `Engine SMOH (${(smoh ?? 0).toLocaleString()}h) is at ${enginePct}% of the ` +
        `${engineTbo.toLocaleString()}h TBO. An overhaul is due.`,
      severity: 'critical',
    })
  }
  // (6) Prop past TBO.
  if (propPct != null && propPct >= 100) {
    discrepancies.push({
      title: 'Propeller has reached or exceeded TBO',
      detail:
        `Prop SPOH (${(spoh ?? 0).toLocaleString()}h) is at ${propPct}% of the ` +
        `${propTbo.toLocaleString()}h TBO. A prop overhaul is due.`,
      severity: 'critical',
    })
  }

  if (discrepancies.length === 0) {
    discrepancies.push({
      title: 'No timing discrepancies detected',
      detail:
        'Airframe, engine, and prop times reconcile within tolerance, and no record gaps ' +
        'or extra engine events were found.',
      severity: 'info',
    })
  }

  // --- Time Since Key Events ----------------------------------------------
  const sinceAnswer = sinceRes.answer || ''
  const lower = sinceAnswer.toLowerCase()
  const mention = (kw: string) => lower.includes(kw)
  const timeSince: TimeSinceRow[] = [
    {
      label: 'Last Annual Inspection',
      hours: null,
      calendar: null,
      found: sinceRes.chunkCount > 0 && mention('annual'),
    },
    {
      label: 'Last 100-Hour Inspection',
      hours: null,
      calendar: null,
      found: sinceRes.chunkCount > 0 && mention('100-hour') || mention('100 hour'),
    },
    {
      label: 'Engine Overhaul (SMOH)',
      hours: smoh,
      calendar: null,
      found: smoh != null || (smohRes.chunkCount > 0 && mention('overhaul')),
    },
    {
      label: 'Prop Overhaul (SPOH)',
      hours: spoh,
      calendar: null,
      found: spoh != null || (spohRes.chunkCount > 0 && mention('prop')),
    },
    {
      label: 'Last Compression Check',
      hours: null,
      calendar: null,
      found: sinceRes.chunkCount > 0 && (mention('compression') || mention('cylinder')),
    },
    {
      label: 'Last Oil Analysis',
      hours: null,
      calendar: null,
      found: sinceRes.chunkCount > 0 && mention('oil analysis'),
    },
  ]

  // --- Assemble the report -------------------------------------------------
  const citations: IntelligenceCitation[] = [
    ...ttafRes.citations,
    ...smohRes.citations,
    ...installRes.citations,
    ...tboRes.citations,
    ...spohRes.citations,
    ...propTboRes.citations,
    ...multiEngineRes.citations,
    ...gapRes.citations,
    ...sinceRes.citations,
  ]

  const data: TimeComparisonData = {
    airframe: { ttaf },
    engine: { smoh, tbo: engineTbo, pct: enginePct, install_tach: installTach },
    prop: { spoh, tbo: propTbo, pct: propPct },
    discrepancies,
    timeSince,
    citations,
  }

  const report: IntelligenceReport<TimeComparisonData> = {
    module: 'time-comparison',
    aircraft_id: aircraftId,
    generated_at: new Date().toISOString(),
    data,
    cached: false,
  }

  await writeIntelligenceCache(supabase, {
    aircraftId,
    orgId: organizationId,
    module: 'time-comparison',
    result: report as unknown as Record<string, unknown>,
  })

  return NextResponse.json(report)
}
