import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export interface ComputedStatusInput {
  aircraftId: string
  organizationId: string
}

export async function computeAircraftStatus(input: ComputedStatusInput): Promise<void> {
  const supabase = createServiceSupabase()

  const [eventsRes, adRes, docsRes, aircraftRes] = await Promise.all([
    supabase
      .from('maintenance_events')
      .select('*')
      .eq('aircraft_id', input.aircraftId)
      .order('entry_date', { ascending: true }),
    supabase
      .from('aircraft_ad_applicability')
      .select('*')
      .eq('aircraft_id', input.aircraftId),
    supabase
      .from('documents')
      .select('id, doc_type, file_name')
      .eq('aircraft_id', input.aircraftId),
    supabase
      .from('aircraft')
      .select('*')
      .eq('id', input.aircraftId)
      .single(),
  ])

  const events = eventsRes.data ?? []
  const adRecords = adRes.data ?? []
  const documents = docsRes.data ?? []
  const aircraft = aircraftRes.data

  if (!aircraft) return

  // --- AIRFRAME TIME ---
  const latestWithTime = [...events]
    .reverse()
    .find((e: any) => e.aircraft_total_time != null)

  const airframeTime = (latestWithTime as any)?.aircraft_total_time ?? null
  const airframeTimeSourceDate = (latestWithTime as any)?.entry_date ?? null

  // --- ENGINE TIME ---
  const engineOverhauls = events.filter((e: any) =>
    ['engine_overhaul', 'engine_replacement'].includes(e.event_type)
  )
  const lastOverhaul = engineOverhauls[engineOverhauls.length - 1] as any
  const engineTimeSinceOverhaul =
    lastOverhaul && airframeTime
      ? airframeTime - lastOverhaul.aircraft_total_time
      : null

  // --- PROP TIME ---
  const propOverhauls = events.filter((e: any) =>
    ['prop_overhaul', 'prop_replacement'].includes(e.event_type)
  )
  const lastPropOverhaul = propOverhauls[propOverhauls.length - 1] as any
  const propTimeSinceOverhaul =
    lastPropOverhaul && airframeTime
      ? airframeTime - lastPropOverhaul.aircraft_total_time
      : null

  // --- ANNUAL INSPECTION ---
  const annuals = events
    .filter((e: any) => e.event_type === 'annual_inspection')
    .sort(
      (a: any, b: any) =>
        new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
    )
  const lastAnnual = annuals[0] as any
  const lastAnnualDate = lastAnnual?.entry_date
    ? new Date(lastAnnual.entry_date)
    : null
  const annualNextDue = lastAnnualDate
    ? new Date(
        lastAnnualDate.getFullYear() + 1,
        lastAnnualDate.getMonth(),
        lastAnnualDate.getDate()
      )
    : null
  const annualIsCurrent = annualNextDue ? annualNextDue >= new Date() : false

  // --- ELT ---
  const lastElt = findLastByType(events, 'elt_inspection') as any
  const eltNextDue = addMonths(lastElt?.entry_date, 24)
  const eltIsCurrent = eltNextDue ? eltNextDue >= new Date() : false

  // --- TRANSPONDER ---
  const lastXpdr = findLastByType(events, 'transponder_test') as any
  const xpdrNextDue = addMonths(lastXpdr?.entry_date, 24)
  const xpdrIsCurrent = xpdrNextDue ? xpdrNextDue >= new Date() : false

  // --- PITOT-STATIC ---
  const lastPS = findLastByType(events, 'pitot_static_test') as any
  const psNextDue = addMonths(lastPS?.entry_date, 24)
  const psIsCurrent = psNextDue ? psNextDue >= new Date() : false

  // --- ALTIMETER ---
  const lastAlt = findLastByType(events, 'altimeter_calibration') as any
  const altNextDue = addMonths(lastAlt?.entry_date, 24)
  const altIsCurrent = altNextDue ? altNextDue >= new Date() : false

  // --- VOR CHECK ---
  const lastVor = findLastByType(events, 'vor_check') as any
  const vorNextDue = addDays(lastVor?.entry_date, 30)
  const vorIsCurrent = vorNextDue ? vorNextDue >= new Date() : false

  // --- AD SUMMARY ---
  const totalAds = adRecords.length
  const adsComplied = adRecords.filter((a: any) => a.compliance_status === 'complied').length
  const adsOpen = adRecords.filter((a: any) => a.compliance_status === 'open').length
  const adsUnknown = adRecords.filter((a: any) => a.compliance_status === 'unknown').length

  const upcomingAds = adRecords
    .filter((a: any) => a.next_due_date != null)
    .sort(
      (a: any, b: any) =>
        new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime()
    )
  const nextAd = upcomingAds[0] as any

  // --- REQUIRED DOCUMENTS ---
  const hasRegistration = documents.some((d: any) => d.doc_type === 'registration')
  const hasAirworthinessCert = documents.some((d: any) => d.doc_type === 'airworthiness_cert')
  const hasWeightBalance = documents.some((d: any) => d.doc_type === 'weight_balance')
  const hasEquipmentList = documents.some(
    (d: any) => d.doc_type === 'weight_balance' || d.doc_type === 'equipment_list'
  )

  // --- HEALTH SCORE ---
  const healthBreakdown = computeHealthScore({
    annualIsCurrent,
    eltIsCurrent,
    xpdrIsCurrent,
    psIsCurrent,
    adsOpen,
    totalAds,
    hasRegistration,
    hasAirworthinessCert,
    hasWeightBalance,
  })

  // --- UPSERT ---
  await supabase.from('aircraft_computed_status').upsert(
    {
      aircraft_id: input.aircraftId,
      organization_id: input.organizationId,
      computed_at: new Date().toISOString(),

      airframe_total_time: airframeTime,
      airframe_time_source_date: airframeTimeSourceDate,

      engine_time_since_overhaul: engineTimeSinceOverhaul,
      engine_last_overhaul_date: lastOverhaul?.entry_date ?? null,
      engine_last_overhaul_shop: extractOverhaulShop(lastOverhaul),

      prop_time_since_overhaul: propTimeSinceOverhaul,
      prop_last_overhaul_date: lastPropOverhaul?.entry_date ?? null,

      last_annual_date: lastAnnual?.entry_date ?? null,
      last_annual_aircraft_time: lastAnnual?.aircraft_total_time ?? null,
      annual_next_due_date: annualNextDue?.toISOString().split('T')[0] ?? null,
      annual_is_current: annualIsCurrent,

      last_elt_inspection_date: lastElt?.entry_date ?? null,
      elt_next_due_date: eltNextDue?.toISOString().split('T')[0] ?? null,
      elt_is_current: eltIsCurrent,

      last_transponder_test_date: lastXpdr?.entry_date ?? null,
      transponder_next_due_date: xpdrNextDue?.toISOString().split('T')[0] ?? null,
      transponder_is_current: xpdrIsCurrent,

      last_pitot_static_date: lastPS?.entry_date ?? null,
      pitot_static_next_due_date: psNextDue?.toISOString().split('T')[0] ?? null,
      pitot_static_is_current: psIsCurrent,

      last_altimeter_date: lastAlt?.entry_date ?? null,
      altimeter_next_due_date: altNextDue?.toISOString().split('T')[0] ?? null,
      altimeter_is_current: altIsCurrent,

      last_vor_check_date: lastVor?.entry_date ?? null,
      vor_check_next_due_date: vorNextDue?.toISOString().split('T')[0] ?? null,
      vor_check_is_current: vorIsCurrent,

      total_applicable_ads: totalAds,
      ads_complied: adsComplied,
      ads_open: adsOpen,
      ads_unknown: adsUnknown,
      next_ad_due_date: nextAd?.next_due_date ?? null,
      next_ad_number: nextAd?.ad_number ?? null,

      has_registration: hasRegistration,
      has_airworthiness_cert: hasAirworthinessCert,
      has_weight_balance: hasWeightBalance,
      has_equipment_list: hasEquipmentList,

      health_score: healthBreakdown.total,
      health_score_breakdown: healthBreakdown.breakdown,

      updated_at: new Date().toISOString(),
    },
    { onConflict: 'aircraft_id' }
  )
}

// --- Helpers ---

function findLastByType(events: any[], type: string) {
  return [...events]
    .filter((e: any) => e.event_type === type)
    .sort(
      (a: any, b: any) =>
        new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
    )[0]
}

function addMonths(dateStr: string | null | undefined, months: number): Date | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d
}

function addDays(dateStr: string | null | undefined, days: number): Date | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d
}

function extractOverhaulShop(event: any): string | null {
  if (!event) return null
  const desc = event.work_description ?? ''
  const shopMatch =
    desc.match(/overhauled by ([^,.]+)/i) ?? desc.match(/at ([^,.]+) shop/i)
  return shopMatch?.[1]?.trim() ?? null
}

interface HealthScoreInput {
  annualIsCurrent: boolean
  eltIsCurrent: boolean
  xpdrIsCurrent: boolean
  psIsCurrent: boolean
  adsOpen: number
  totalAds: number
  hasRegistration: boolean
  hasAirworthinessCert: boolean
  hasWeightBalance: boolean
}

function computeHealthScore(input: HealthScoreInput): {
  total: number
  breakdown: Record<string, number>
} {
  const breakdown: Record<string, number> = {
    annual: input.annualIsCurrent ? 30 : 0,
    elt: input.eltIsCurrent ? 10 : 0,
    transponder: input.xpdrIsCurrent ? 10 : 0,
    pitot_static: input.psIsCurrent ? 10 : 0,
    ads:
      input.totalAds === 0
        ? 20
        : Math.round((1 - input.adsOpen / input.totalAds) * 20),
    registration: input.hasRegistration ? 10 : 0,
    airworthiness: input.hasAirworthinessCert ? 5 : 0,
    weight_balance: input.hasWeightBalance ? 5 : 0,
  }
  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0)
  return { total, breakdown }
}
