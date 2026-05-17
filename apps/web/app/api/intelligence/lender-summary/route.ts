/**
 * POST /api/intelligence/lender-summary — the Lender / Insurance Summary
 * module of the Aircraft Intelligence Suite.
 *
 * Assembles the clean, professional summary package that lenders and
 * insurance underwriters routinely ask for: identity header, airworthiness
 * status, title indicators, a maintenance snapshot, incident history, and a
 * documents-on-file checklist — designed to be exported as a one-page PDF.
 *
 * EFFICIENCY: this module is a roll-up. It REUSES the cached results of the
 * `history`, `prebuy`, and `ad-traceability` modules wherever they answer a
 * section, and only calls runIntelligenceQuery for a specific fact when no
 * fresh cache covers it — it never re-runs those expensive analyses.
 *
 * Owner + admin only — the shop persona is rejected (403). Results are cached
 * 24h via intelligence_cache; pass `regenerate:true` to bypass.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { runIntelligenceQuery } from '@/lib/rag/intelligence-query'
import { readIntelligenceCache, writeIntelligenceCache } from '@/lib/intelligence/cache'
import type { IntelligenceCitation, IntelligenceReport } from '@/lib/intelligence/types'

export const dynamic = 'force-dynamic'

// --- Report shape ----------------------------------------------------------

interface LenderHeader {
  tail_number: string | null
  make: string | null
  model: string | null
  year: number | null
  serial_number: string | null
  prepared_by: string
  generated_date: string
}

interface AirworthinessSection {
  status: 'AIRWORTHY' | 'REQUIRES REVIEW'
  annual_current: boolean | null
  annual_expiration: string | null
  annual_note: string
  open_ad_count: number | null
  open_ad_note: string
  open_squawk_count: number
}

interface TitleSection {
  text: string
  form_337_count: number | null
  lien_note: string
}

interface MaintenanceSection {
  text: string
  years_of_records: number | null
}

interface IncidentSection {
  text: string
  damage_found: boolean
  note: string
}

interface DocumentsChecklistItem {
  label: string
  present: boolean
}

interface LenderSummaryData {
  empty?: boolean
  header?: LenderHeader
  airworthiness?: AirworthinessSection
  title?: TitleSection
  maintenance_summary?: MaintenanceSection
  incident_history?: IncidentSection
  documents_on_file?: DocumentsChecklistItem[]
  citations?: IntelligenceCitation[]
}

/** Required document categories surfaced as a ✓/✗ checklist. */
const DOC_CHECKLIST: Array<{ label: string; doc_types: string[]; keywords: string[] }> = [
  { label: 'Airframe Logbook', doc_types: ['logbook'], keywords: ['airframe', 'aircraft log'] },
  { label: 'Engine Logbook', doc_types: ['logbook'], keywords: ['engine log'] },
  { label: 'Propeller Logbook', doc_types: ['logbook'], keywords: ['prop log', 'propeller log'] },
  { label: 'POH / AFM', doc_types: ['poh', 'afm', 'afm_supplement'], keywords: ['poh', 'afm', 'flight manual'] },
  { label: 'STC Paperwork', doc_types: ['stc'], keywords: ['stc', 'supplemental type'] },
  { label: 'Form 337', doc_types: ['form_337'], keywords: ['337'] },
  { label: 'Annual Inspection', doc_types: ['inspection_report'], keywords: ['annual'] },
  { label: 'Insurance', doc_types: ['insurance'], keywords: ['insurance'] },
]

/** Pull the `.data` payload out of a cached IntelligenceReport row. */
function cacheData(cached: { result_json: Record<string, unknown> } | null): Record<string, unknown> | null {
  if (!cached) return null
  const data = (cached.result_json as { data?: unknown }).data
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null
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
    return NextResponse.json(
      { error: 'Aircraft Intelligence is owner-only.' },
      { status: 403 },
    )
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

  // --- Cache hit for THIS module ------------------------------------------
  if (!regenerate) {
    const cached = await readIntelligenceCache(supabase, aircraftId, 'lender-summary')
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
    const emptyReport: IntelligenceReport<LenderSummaryData> = {
      module: 'lender-summary',
      aircraft_id: aircraftId,
      generated_at: new Date().toISOString(),
      data: { empty: true },
      cached: false,
    }
    return NextResponse.json(emptyReport)
  }

  // --- Reuse the sibling modules' caches ----------------------------------
  // We pull each module's most recent non-expired cache and mine it for the
  // facts each section needs. runIntelligenceQuery is only called below as a
  // targeted fallback when no fresh cache covers a fact.
  const [historyCache, prebuyCache, adCache] = await Promise.all([
    readIntelligenceCache(supabase, aircraftId, 'history'),
    readIntelligenceCache(supabase, aircraftId, 'prebuy'),
    readIntelligenceCache(supabase, aircraftId, 'ad-traceability'),
  ])
  const historyData = cacheData(historyCache)
  const prebuyData = cacheData(prebuyCache)
  const adData = cacheData(adCache)

  const citations: IntelligenceCitation[] = []
  const pushCitations = (list: unknown) => {
    if (Array.isArray(list)) {
      for (const c of list) {
        if (c && typeof c === 'object' && 'doc_name' in c) {
          citations.push(c as IntelligenceCitation)
        }
      }
    }
  }

  const q = (question: string, strategy: Parameters<typeof runIntelligenceQuery>[0]['strategy']) =>
    runIntelligenceQuery({ organizationId, aircraftId, question, strategy })

  // --- 1. Header ----------------------------------------------------------
  let preparedBy = 'Aircraft Owner'
  try {
    const { profile, organization } = await requireAppServerSession()
    preparedBy =
      (profile?.full_name && profile.full_name.trim()) ||
      (organization?.slug && `${organization.slug} (organization)`) ||
      (profile?.email && profile.email.trim()) ||
      'Aircraft Owner'
  } catch {
    // defensive — context already proved an authenticated membership
  }

  const header: LenderHeader = {
    tail_number: ac.tail_number,
    make: ac.make,
    model: ac.model,
    year: ac.year,
    serial_number: ac.serial_number,
    prepared_by: preparedBy,
    generated_date: new Date().toISOString(),
  }

  // --- 2. Airworthiness ---------------------------------------------------
  // Annual currency: prefer the history module's current_status narrative;
  // fall back to a single targeted query only if no history cache exists.
  let annualNarrative = ''
  const historyCurrentStatus = historyData?.current_status as
    | { text?: string; citations?: unknown }
    | undefined
  if (historyCurrentStatus?.text) {
    annualNarrative = String(historyCurrentStatus.text)
    pushCitations(historyCurrentStatus.citations)
  } else {
    const annualRes = await q(
      'What is the current annual inspection status and expiration date for this aircraft?',
      'tree',
    )
    annualNarrative = annualRes.answer
    pushCitations(annualRes.citations)
  }

  const annualLower = annualNarrative.toLowerCase()
  let annualCurrent: boolean | null = null
  if (/(annual)[^.]*\b(current|in compliance|valid|up to date|up-to-date)\b/.test(annualLower)) {
    annualCurrent = true
  } else if (/(annual)[^.]*\b(expired|overdue|out of compliance|lapsed|not current)\b/.test(annualLower)) {
    annualCurrent = false
  }
  // ISO-ish expiration date if the narrative states one.
  const dateMatch = annualNarrative.match(
    /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]+ \d{1,2},? \d{4})\b/,
  )
  const annualExpiration = dateMatch ? dateMatch[0] : null

  // Open ADs: prefer the ad-traceability cache (overdue / no-evidence count);
  // fall back to a query only if that cache is absent.
  let openAdCount: number | null = null
  let openAdNote = ''
  if (Array.isArray(adData?.ads)) {
    const ads = adData!.ads as Array<{ status?: string }>
    openAdCount = ads.filter((a) => a.status === 'overdue' || a.status === 'no-evidence').length
    openAdNote =
      openAdCount === 0
        ? 'No overdue or undocumented ADs in the uploaded records.'
        : `${openAdCount} AD${openAdCount === 1 ? '' : 's'} overdue or lacking compliance evidence.`
  } else {
    const adRes = await q(
      'Are any airworthiness directives overdue or lacking compliance evidence in these records?',
      'hybrid_all',
    )
    pushCitations(adRes.citations)
    openAdNote = adRes.chunkCount === 0
      ? 'No AD compliance records were found to evaluate.'
      : adRes.answer
  }

  // Open squawks: always a direct, authoritative DB count.
  const { count: openSquawkCount } = await supabase
    .from('squawks')
    .select('id', { count: 'exact', head: true })
    .eq('aircraft_id', aircraftId)
    .not('status', 'in', '("resolved","closed","verified")')

  const squawkCount = openSquawkCount ?? 0
  const requiresReview =
    annualCurrent === false || (openAdCount != null && openAdCount > 0) || squawkCount > 0

  const airworthiness: AirworthinessSection = {
    status: requiresReview ? 'REQUIRES REVIEW' : 'AIRWORTHY',
    annual_current: annualCurrent,
    annual_expiration: annualExpiration,
    annual_note: annualNarrative.trim() || 'Annual inspection status could not be determined from the records.',
    open_ad_count: openAdCount,
    open_ad_note: openAdNote,
    open_squawk_count: squawkCount,
  }

  // --- 3. Title -----------------------------------------------------------
  // STCs + Form 337 dates come from the history module's identity narrative
  // (which already enumerates STCs and 337s); fall back to a query if absent.
  let titleText = ''
  const historyIdentity = historyData?.identity as { text?: string; citations?: unknown } | undefined
  if (historyIdentity?.text) {
    titleText = String(historyIdentity.text)
    pushCitations(historyIdentity.citations)
  } else {
    const titleRes = await q(
      'List all STCs on file with their STC numbers, and all Form 337 major repair/alteration ' +
        'records with their dates and descriptions.',
      'hybrid_all',
    )
    titleText = titleRes.answer
    pushCitations(titleRes.citations)
  }

  // Form 337 count from a direct documents query (authoritative).
  const { count: form337Count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('aircraft_id', aircraftId)
    .eq('doc_type', 'form_337')
    .is('deleted_at', null)

  const title: TitleSection = {
    text: titleText.trim() || 'No STC or Form 337 records were identified in the uploaded documents.',
    form_337_count: form337Count ?? 0,
    lien_note:
      'Lien search not performed — verify aircraft title and any recorded liens directly ' +
      'with the FAA Aircraft Registry (Oklahoma City).',
  }

  // --- 4. Maintenance Summary ---------------------------------------------
  // Reuse the history module's timeline narratives (annuals + overhauls);
  // fall back to a single query only if no history cache exists.
  let maintenanceText = ''
  const historyTimeline = historyData?.timeline as
    | {
        annuals?: { text?: string; citations?: unknown }
        overhauls?: { text?: string; citations?: unknown }
      }
    | undefined
  if (historyTimeline?.annuals?.text || historyTimeline?.overhauls?.text) {
    const parts: string[] = []
    if (historyTimeline.annuals?.text) {
      parts.push(`Annual inspections: ${String(historyTimeline.annuals.text).trim()}`)
      pushCitations(historyTimeline.annuals.citations)
    }
    if (historyTimeline.overhauls?.text) {
      parts.push(
        `Engine / propeller overhauls: ${String(historyTimeline.overhauls.text).trim()}`,
      )
      pushCitations(historyTimeline.overhauls.citations)
    }
    maintenanceText = parts.join('\n\n')
  } else {
    const maintRes = await q(
      'Summarize the maintenance history: how many years of records are on file, total ' +
        'documented airframe hours, the most recent annual inspection (date and IA), engine ' +
        'time since major overhaul (SMOH) and overhaul date, and propeller time since prop ' +
        'overhaul (SPOH).',
      'tree',
    )
    maintenanceText = maintRes.answer
    pushCitations(maintRes.citations)
  }

  // Years of records: span of document upload-relevant dates if available.
  let yearsOfRecords: number | null = null
  const { data: docDateRows } = await supabase
    .from('documents')
    .select('created_at')
    .eq('aircraft_id', aircraftId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (Array.isArray(docDateRows) && docDateRows.length > 0) {
    const first = new Date(String((docDateRows[0] as { created_at?: string }).created_at))
    if (!Number.isNaN(first.getTime())) {
      const yrs = (Date.now() - first.getTime()) / (365.25 * 24 * 3600 * 1000)
      yearsOfRecords = Math.max(0, Math.round(yrs * 10) / 10)
    }
  }

  const maintenance_summary: MaintenanceSection = {
    text:
      maintenanceText.trim() ||
      'Insufficient records to summarize the maintenance history for this aircraft.',
    years_of_records: yearsOfRecords,
  }

  // --- 5. Incident History ------------------------------------------------
  // Prefer the history module's `damage` narrative; the prebuy module's
  // damage-history section is a secondary source; query only as last resort.
  let incidentText = ''
  const historyDamage = historyData?.damage as { text?: string; citations?: unknown } | undefined
  const prebuyDamage = Array.isArray(prebuyData?.sections)
    ? (prebuyData!.sections as Array<{ id?: string; summary?: string; citations?: unknown }>).find(
        (s) => s.id === 'damage-history',
      )
    : undefined

  if (historyDamage?.text) {
    incidentText = String(historyDamage.text)
    pushCitations(historyDamage.citations)
  } else if (prebuyDamage?.summary) {
    incidentText = String(prebuyDamage.summary)
    pushCitations(prebuyDamage.citations)
  } else {
    const damageRes = await q(
      'Find any references to damage, accidents, hard landings, prop strikes, lightning ' +
        'strikes, or insurance claims in these maintenance records.',
      'hybrid_vb',
    )
    incidentText = damageRes.answer
    pushCitations(damageRes.citations)
  }

  const incidentLower = incidentText.toLowerCase()
  const damageFound =
    incidentText.trim().length > 0 &&
    /\b(damage|accident|hard landing|prop strike|propeller strike|lightning strike|insurance claim|substantial)\b/.test(
      incidentLower,
    ) &&
    !/\bno (damage|accident|incident)/.test(incidentLower)

  const incident_history: IncidentSection = {
    text: damageFound
      ? incidentText.trim()
      : 'No damage history found in uploaded records.',
    damage_found: damageFound,
    note:
      'Based on uploaded maintenance records only. Does not substitute for an official ' +
      'NTSB or FAA accident/incident record search.',
  }

  // --- 6. Documents on File -----------------------------------------------
  const { data: docRows } = await supabase
    .from('documents')
    .select('doc_type, document_subtype, title')
    .eq('aircraft_id', aircraftId)
    .is('deleted_at', null)

  const docs = ((docRows as Array<Record<string, unknown>>) ?? []).map((d) => ({
    doc_type: typeof d.doc_type === 'string' ? d.doc_type.toLowerCase() : '',
    haystack: `${d.doc_type ?? ''} ${d.document_subtype ?? ''} ${d.title ?? ''}`.toLowerCase(),
  }))

  const documents_on_file: DocumentsChecklistItem[] = DOC_CHECKLIST.map((item) => {
    const present = docs.some(
      (d) =>
        item.doc_types.includes(d.doc_type) ||
        item.keywords.some((k) => d.haystack.includes(k)),
    )
    return { label: item.label, present }
  })

  // --- Assemble & cache ---------------------------------------------------
  // De-duplicate citations by doc_name + page + excerpt.
  const seen = new Set<string>()
  const dedupedCitations = citations.filter((c) => {
    const key = `${c.doc_name}|${c.page_number ?? ''}|${(c.excerpt ?? '').slice(0, 60)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const data: LenderSummaryData = {
    header,
    airworthiness,
    title,
    maintenance_summary,
    incident_history,
    documents_on_file,
    citations: dedupedCitations,
  }

  const report: IntelligenceReport<LenderSummaryData> = {
    module: 'lender-summary',
    aircraft_id: aircraftId,
    generated_at: new Date().toISOString(),
    data,
    cached: false,
  }

  await writeIntelligenceCache(supabase, {
    aircraftId,
    orgId: organizationId,
    module: 'lender-summary',
    result: report as unknown as Record<string, unknown>,
  })

  return NextResponse.json(report)
}
