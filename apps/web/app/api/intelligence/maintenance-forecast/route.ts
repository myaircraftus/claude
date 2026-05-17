/**
 * POST /api/intelligence/maintenance-forecast — Maintenance Forecast module
 * of the Aircraft Intelligence Suite.
 *
 * Predicts upcoming maintenance from current tach time, calendar dates, and
 * inspection history. Current times are RAG-derived; the upcoming-events list
 * is assembled from the compliance_items / document_expirations tables and the
 * recurring ADs surfaced by the AD / SB Traceability module's cache.
 * Owner-only — the shop persona is blocked. Results are cached for 24h in
 * intelligence_cache; pass `regenerate: true` to bypass.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { getCurrentPersona } from '@/lib/persona/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { runIntelligenceQuery } from '@/lib/rag/intelligence-query'
import { readIntelligenceCache, writeIntelligenceCache } from '@/lib/intelligence/cache'
import type { IntelligenceCitation, IntelligenceReport } from '@/lib/intelligence/types'

export const dynamic = 'force-dynamic'

/** Current airframe / engine / prop times — extracted from the RAG answer. */
interface CurrentTimes {
  ttaf: number | null
  smoh: number | null
  spoh: number | null
  sinceLast100: number | null
}

/** One predicted maintenance event on the 12-month horizon. */
interface UpcomingEvent {
  label: string
  due_date: string | null
  due_hours: number | null
  /** annual | hundred-hour | engine-tbo | prop-tbo | ad | elt | xpdr | vor | item */
  kind: string
  overdue: boolean
  /** Free-text note (e.g. "% of TBO used", "cannot verify from logs"). */
  detail?: string
}

/** Module-specific `data` payload of the forecast IntelligenceReport. */
interface ForecastData {
  empty?: boolean
  currentTimes: CurrentTimes
  upcoming: UpcomingEvent[]
  overdue: UpcomingEvent[]
  /** Plain-language summary of the current-times RAG query. */
  summary: string
  citations: IntelligenceCitation[]
}

/** Add whole calendar months to an ISO/date string; null-safe. */
function addMonths(date: string | null, months: number): string | null {
  if (!date) return null
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return null
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

/** Pull the first number that follows any of the given labels in free text. */
function extractHours(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const re = new RegExp(
      `${label}[^0-9]{0,40}?(\\d{1,5}(?:[.,]\\d{1,2})?)\\s*(?:hours|hrs|hr)?`,
      'i',
    )
    const m = re.exec(text)
    if (m) {
      const n = Number(m[1].replace(',', ''))
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

/** Pull a date (ISO or "Month DD, YYYY" / "MM/DD/YYYY") near a label. */
function extractDate(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      `${label}[^0-9A-Za-z]{0,40}?` +
        `(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{2,4}|` +
        `(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+\\d{4})`,
      'i',
    )
    const m = re.exec(text)
    if (m) {
      const d = new Date(m[1])
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
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
    .select('id, tail_number, make, model, total_time_hours')
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
  }

  // --- Cache hit -----------------------------------------------------------
  if (!regenerate) {
    const cached = await readIntelligenceCache(supabase, aircraftId, 'maintenance-forecast')
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
    const emptyReport: IntelligenceReport<ForecastData> = {
      module: 'maintenance-forecast',
      aircraft_id: aircraftId,
      generated_at: new Date().toISOString(),
      data: {
        empty: true,
        currentTimes: { ttaf: null, smoh: null, spoh: null, sinceLast100: null },
        upcoming: [],
        overdue: [],
        summary: '',
        citations: [],
      },
      cached: false,
    }
    return NextResponse.json(emptyReport)
  }

  // --- RAG: current times + TBO -------------------------------------------
  const timesRes = await runIntelligenceQuery({
    organizationId,
    aircraftId,
    question:
      'What is the current total time, time since engine overhaul, time since prop ' +
      'overhaul, the last annual inspection date, the time since the last 100-hour ' +
      'inspection, and the manufacturer recommended engine TBO in hours?',
    strategy: 'tree',
  })
  const answer = timesRes.answer ?? ''

  const ttaf = ac.total_time_hours ?? extractHours(answer, ['total time', 'TTAF', 'total airframe'])
  const smoh = extractHours(answer, ['since engine overhaul', 'SMOH', 'SOH', 'engine overhaul'])
  const spoh = extractHours(answer, ['since prop overhaul', 'SPOH', 'propeller overhaul', 'prop overhaul'])
  const sinceLast100 = extractHours(answer, ['since the last 100-hour', 'since last 100', '100-hour'])
  const lastAnnual = extractDate(answer, ['last annual', 'annual inspection'])
  const engineTbo = extractHours(answer, ['TBO', 'time between overhaul']) ?? 2000

  const today = new Date().toISOString().slice(0, 10)
  const isPast = (d: string | null) => Boolean(d) && (d as string) < today

  const upcoming: UpcomingEvent[] = []

  // Annual inspection — 12 calendar months from the last annual.
  const annualDue = addMonths(lastAnnual, 12)
  if (annualDue) {
    upcoming.push({
      label: 'Annual Inspection',
      due_date: annualDue,
      due_hours: null,
      kind: 'annual',
      overdue: isPast(annualDue),
      detail: lastAnnual ? `Last annual ${lastAnnual} (FAR 91.409).` : undefined,
    })
  }

  // 100-hour inspection — only when one is tracked (commercial use).
  if (sinceLast100 != null) {
    const remaining = Math.max(0, 100 - sinceLast100)
    upcoming.push({
      label: '100-Hour Inspection',
      due_date: null,
      due_hours: ttaf != null ? ttaf + remaining : remaining,
      kind: 'hundred-hour',
      overdue: sinceLast100 >= 100,
      detail: `${sinceLast100.toFixed(1)} hrs since last — ${remaining.toFixed(1)} hrs remaining (FAR 91.409).`,
    })
  }

  // Engine TBO — % of TBO used = SMOH / TBO.
  if (smoh != null && engineTbo > 0) {
    const pct = Math.round((smoh / engineTbo) * 100)
    upcoming.push({
      label: 'Engine Overhaul (TBO)',
      due_date: null,
      due_hours: ttaf != null ? ttaf + Math.max(0, engineTbo - smoh) : Math.max(0, engineTbo - smoh),
      kind: 'engine-tbo',
      overdue: smoh >= engineTbo,
      detail: `${pct}% of ${engineTbo}h TBO used (SMOH ${smoh.toFixed(1)}h).`,
    })
  }

  // Prop TBO — informational; intervals vary by prop, surface SPOH.
  if (spoh != null) {
    upcoming.push({
      label: 'Propeller Overhaul (TBO)',
      due_date: null,
      due_hours: null,
      kind: 'prop-tbo',
      overdue: false,
      detail: `${spoh.toFixed(1)} hrs since prop overhaul — verify TBO against the prop manufacturer's service letter.`,
    })
  }

  // --- Compliance items — feed the upcoming-events list -------------------
  const { data: ciRows } = await supabase
    .from('compliance_items')
    .select(
      'title, status, next_due_date, interval_calendar_months, interval_hours, last_completed_date',
    )
    .eq('aircraft_id', aircraftId)

  for (const row of ((ciRows as Array<Record<string, any>>) ?? [])) {
    const dueDate: string | null =
      typeof row.next_due_date === 'string' ? row.next_due_date : null
    const within12mo = dueDate ? dueDate <= addMonths(today, 12)! : false
    if (!dueDate && row.status !== 'overdue') continue
    if (dueDate && !within12mo && row.status !== 'overdue') continue
    upcoming.push({
      label: String(row.title ?? 'Compliance item'),
      due_date: dueDate,
      due_hours: null,
      kind: 'item',
      overdue: row.status === 'overdue' || isPast(dueDate),
      detail: row.interval_calendar_months
        ? `Every ${row.interval_calendar_months} months.`
        : row.interval_hours
          ? `Every ${row.interval_hours} hrs.`
          : undefined,
    })
  }

  // --- Document expirations ------------------------------------------------
  const { data: deRows } = await supabase
    .from('document_expirations')
    .select('document_name, document_type, expiration_date')
    .eq('aircraft_id', aircraftId)

  for (const row of ((deRows as Array<Record<string, any>>) ?? [])) {
    const exp: string | null =
      typeof row.expiration_date === 'string' ? row.expiration_date : null
    if (!exp) continue
    if (exp > addMonths(today, 12)! && exp >= today) continue
    upcoming.push({
      label: String(row.document_name ?? 'Document'),
      due_date: exp,
      due_hours: null,
      kind: 'item',
      overdue: isPast(exp),
      detail: row.document_type ? String(row.document_type) : undefined,
    })
  }

  // --- Recurring ADs — reuse the AD / SB Traceability cache ----------------
  try {
    const adCache = await readIntelligenceCache(supabase, aircraftId, 'ad-traceability')
    const adData = (adCache?.result_json as Record<string, any> | undefined)?.data
    const ads = Array.isArray(adData?.ads) ? adData.ads : []
    for (const ad of ads as Array<Record<string, any>>) {
      if (ad.type !== 'recurring') continue
      const due: string | null = typeof ad.next_due_date === 'string' ? ad.next_due_date : null
      if (due && due > addMonths(today, 12)! && due >= today) continue
      upcoming.push({
        label: `Recurring AD ${ad.ad_number ?? ''}`.trim(),
        due_date: due,
        due_hours: null,
        kind: 'ad',
        overdue: ad.status === 'overdue' || isPast(due),
        detail: ad.recurring_interval_months
          ? `Recurs every ${ad.recurring_interval_months} months.`
          : 'Recurring airworthiness directive.',
      })
    }
  } catch {
    // AD cache reuse is best-effort.
  }

  // --- Regulatory calendar items (always shown) ---------------------------
  upcoming.push({
    label: 'ELT Battery / Inspection',
    due_date: null,
    due_hours: null,
    kind: 'elt',
    overdue: false,
    detail: 'ELT battery and inspection due every 24 calendar months (FAR 91.207). Verify last replacement date in the logbooks.',
  })
  upcoming.push({
    label: 'Transponder / Altimeter Check',
    due_date: null,
    due_hours: null,
    kind: 'xpdr',
    overdue: false,
    detail: 'Transponder and altimeter/static system checks due every 24 calendar months (FAR 91.413 / 91.411).',
  })
  upcoming.push({
    label: 'VOR Check',
    due_date: null,
    due_hours: null,
    kind: 'vor',
    overdue: false,
    detail: 'VOR accuracy check required every 30 days for IFR — cannot verify from logs.',
  })

  // --- Split overdue out, sort by how overdue / soonest due ---------------
  const overdue = upcoming
    .filter((e) => e.overdue)
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const future = upcoming
    .filter((e) => !e.overdue)
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))

  const data: ForecastData = {
    currentTimes: { ttaf, smoh, spoh, sinceLast100 },
    upcoming: future,
    overdue,
    summary: answer,
    citations: timesRes.citations,
  }

  const report: IntelligenceReport<ForecastData> = {
    module: 'maintenance-forecast',
    aircraft_id: aircraftId,
    generated_at: new Date().toISOString(),
    data,
    cached: false,
  }

  await writeIntelligenceCache(supabase, {
    aircraftId,
    orgId: organizationId,
    module: 'maintenance-forecast',
    result: report as unknown as Record<string, unknown>,
  })

  return NextResponse.json(report)
}
