/**
 * Tax-time P&L data generator (Spec 7.7).
 *
 * Reads:
 *   - cost_entries        (approved=true, cost_date in YYYY range)
 *   - flight_events       (start_time in YYYY range)
 *   - aircraft            (per-aircraft totals + ownership)
 *   - intake_documents    (count of supporting receipts linked)
 *
 * Returns a structured P&L per aircraft + an org-wide summary. The PDF
 * renderer (pdf-generator.ts) consumes this verbatim — no business logic
 * in the rendering layer.
 *
 * MACRS schedule: General Aviation aircraft = 5-year property under
 * IRS Pub 946 / MACRS GDS. Half-year convention applied. The owner can
 * override with a per-aircraft `depreciation` cost_entry; otherwise we
 * compute a default schedule from `aircraft_acquisition_cost_usd` IF the
 * column exists (it doesn't yet — logged follow-up; today defaults to 0).
 *
 * IRS Schedule C category mapping (lib/costs/categories.ts → Schedule C
 * line items):
 *   Line 9  Car/truck       (n/a for aircraft)
 *   Line 13 Depreciation    depreciation
 *   Line 15 Insurance       insurance
 *   Line 17 Legal/professional
 *   Line 20 Rent (hangar)   hangar, tiedown
 *   Line 21 Repairs         parts, labor, outside_service, annual_inspection,
 *                           100_hour, engine_overhaul_reserve, prop_overhaul_reserve
 *   Line 22 Supplies        oil
 *   Line 23 Taxes/licenses  tax_property, tax_use
 *   Line 27a Other (fuel)   fuel, avionics_database, training, subscription_software
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { CATEGORY_LABEL, type CostCategory } from '@/lib/costs/categories'

const MACRS_5YR_PERCENTS = [0.20, 0.32, 0.192, 0.1152, 0.1152, 0.0576] as const

export const SCHEDULE_C_GROUPS: Record<string, { line: string; categories: CostCategory[] }> = {
  fuel:        { line: 'Line 27a — Other expenses (fuel)', categories: ['fuel'] },
  oil:         { line: 'Line 22 — Supplies (oil)',         categories: ['oil'] },
  hangar:      { line: 'Line 20a — Rent (hangar / tiedown)', categories: ['hangar', 'tiedown'] },
  insurance:   { line: 'Line 15 — Insurance',              categories: ['insurance'] },
  repairs:     { line: 'Line 21 — Repairs and maintenance', categories: [
    'parts', 'labor', 'outside_service', 'annual_inspection', '100_hour',
    'engine_overhaul_reserve', 'prop_overhaul_reserve',
  ] },
  taxes:       { line: 'Line 23 — Taxes and licenses',     categories: ['tax_property', 'tax_use'] },
  databases:   { line: 'Line 27a — Other (databases / software / training)', categories: [
    'avionics_database', 'training', 'subscription_software',
  ] },
  loan:        { line: 'Line 16b — Interest (loan payment)', categories: ['loan_payment'] },
  other:       { line: 'Line 27a — Other',                  categories: ['other'] },
}

export interface AircraftPnlLine {
  category: string
  category_label: string
  schedule_c_line: string
  amount_usd: number
}

export interface AircraftPnl {
  aircraft_id: string
  tail_number: string
  make: string | null
  model: string | null
  year_built: number | null
  /* Revenue */
  revenue_rental_usd: number
  revenue_total_usd: number
  /* Expenses, grouped by Schedule C line */
  expense_lines: AircraftPnlLine[]
  expense_total_usd: number
  /* Depreciation */
  depreciation_logged_usd: number
  depreciation_macrs_usd: number
  depreciation_total_usd: number
  /* Net */
  net_income_usd: number
  flight_hours_in_year: number
  net_per_flight_hour_usd: number | null
  /* Provenance */
  cost_entry_count: number
  intake_document_count: number
}

export interface TaxPnlReport {
  year: number
  generated_at: string
  organization_id: string
  organization_name: string | null
  aircraft: AircraftPnl[]
  total_revenue_usd: number
  total_expense_usd: number
  total_depreciation_usd: number
  total_net_income_usd: number
}

interface BuildArgs {
  supabase: SupabaseClient
  organization_id: string
  year: number
}

export async function buildTaxPnlReport({ supabase, organization_id, year }: BuildArgs): Promise<TaxPnlReport> {
  const yearStart = `${year}-01-01`
  const yearEndExclusive = `${year + 1}-01-01`

  // Org name + aircraft list.
  const [{ data: orgRow }, { data: aircraftRows }] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', organization_id).maybeSingle(),
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model, year, total_time_hours')
      .eq('organization_id', organization_id)
      .eq('is_archived', false)
      .order('tail_number', { ascending: true }),
  ])

  const aircraftList = (aircraftRows ?? []) as Array<{
    id: string; tail_number: string; make: string | null;
    model: string | null; year: number | null; total_time_hours: number | null;
  }>

  // Pull all approved cost_entries + all flight_events for the year in two queries.
  const [{ data: costRows }, { data: flightRows }, { data: intakeCounts }] = await Promise.all([
    supabase
      .from('cost_entries')
      .select('aircraft_id, category, amount, cost_date, bucket')
      .eq('organization_id', organization_id)
      .eq('approved', true)
      .gte('cost_date', yearStart)
      .lt('cost_date', yearEndExclusive),
    supabase
      .from('flight_events')
      .select('aircraft_id, airborne_hours, start_time')
      .eq('organization_id', organization_id)
      .gte('start_time', yearStart)
      .lt('start_time', yearEndExclusive),
    supabase
      .from('intake_documents')
      .select('id, organization_id', { count: 'exact', head: true })
      .eq('organization_id', organization_id),
  ])

  const allCosts = (costRows ?? []) as Array<{
    aircraft_id: string | null; category: string; amount: number; cost_date: string; bucket: string;
  }>
  const allFlights = (flightRows ?? []) as Array<{
    aircraft_id: string; airborne_hours: number; start_time: string;
  }>
  void intakeCounts // count is in res.count, not data; we re-query per aircraft below

  const aircraft: AircraftPnl[] = []
  let total_revenue_usd = 0
  let total_expense_usd = 0
  let total_depreciation_usd = 0
  let total_net_income_usd = 0

  for (const a of aircraftList) {
    const acCosts = allCosts.filter((c) => c.aircraft_id === a.id)
    const acFlights = allFlights.filter((f) => f.aircraft_id === a.id)
    const flight_hours_in_year = acFlights.reduce((s, f) => s + (Number.isFinite(f.airborne_hours) ? Number(f.airborne_hours) : 0), 0)

    // Revenue: aircraft.rental_rate × hours, when column exists. Today: 0.
    // Logged 7.4 follow-up.
    const revenue_rental_usd = 0
    const revenue_total_usd = revenue_rental_usd

    // Group expenses by Schedule C line. Sum per CostCategory.
    const totalsByCategory: Record<string, number> = {}
    for (const c of acCosts) {
      if (!Number.isFinite(c.amount) || c.amount <= 0) continue
      // Depreciation handled separately; loan handled in 'loan' bucket.
      if (c.category === 'depreciation') continue
      totalsByCategory[c.category] = (totalsByCategory[c.category] ?? 0) + Number(c.amount)
    }

    const expense_lines: AircraftPnlLine[] = []
    let expense_total_usd = 0
    for (const group of Object.values(SCHEDULE_C_GROUPS)) {
      for (const cat of group.categories) {
        const amt = totalsByCategory[cat]
        if (!amt || amt <= 0) continue
        expense_lines.push({
          category: cat,
          category_label: CATEGORY_LABEL[cat] ?? cat,
          schedule_c_line: group.line,
          amount_usd: round2(amt),
        })
        expense_total_usd += amt
      }
    }

    // Depreciation: prefer logged depreciation cost_entries; otherwise apply
    // default MACRS-5yr schedule against acquisition_cost (today: 0 — column
    // not present, so default depreciation is $0 unless operator logged it).
    const depreciation_logged_usd = acCosts
      .filter((c) => c.category === 'depreciation')
      .reduce((s, c) => s + (Number.isFinite(c.amount) ? Number(c.amount) : 0), 0)
    const acquisition_cost_usd = 0 // future column — see follow-up
    const ownership_year_index = Math.max(0, year - (a.year ?? year))
    const macrsPct = MACRS_5YR_PERCENTS[Math.min(ownership_year_index, MACRS_5YR_PERCENTS.length - 1)] ?? 0
    const depreciation_macrs_usd = round2(acquisition_cost_usd * macrsPct)
    const depreciation_total_usd = round2(depreciation_logged_usd + depreciation_macrs_usd)

    // Linked intake docs count — quick per-aircraft head query (cheap; few aircraft).
    const { count: linkedDocCount } = await supabase
      .from('intake_documents')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization_id)
      .gte('created_at', yearStart)
      .lt('created_at', yearEndExclusive)

    const net_income_usd = round2(revenue_total_usd - expense_total_usd - depreciation_total_usd)
    const net_per_flight_hour_usd = flight_hours_in_year > 0 ? round2(net_income_usd / flight_hours_in_year) : null

    aircraft.push({
      aircraft_id: a.id,
      tail_number: a.tail_number,
      make: a.make,
      model: a.model,
      year_built: a.year,
      revenue_rental_usd: round2(revenue_rental_usd),
      revenue_total_usd: round2(revenue_total_usd),
      expense_lines,
      expense_total_usd: round2(expense_total_usd),
      depreciation_logged_usd: round2(depreciation_logged_usd),
      depreciation_macrs_usd,
      depreciation_total_usd,
      net_income_usd,
      flight_hours_in_year: round2(flight_hours_in_year),
      net_per_flight_hour_usd,
      cost_entry_count: acCosts.length,
      intake_document_count: linkedDocCount ?? 0,
    })

    total_revenue_usd += revenue_total_usd
    total_expense_usd += expense_total_usd
    total_depreciation_usd += depreciation_total_usd
    total_net_income_usd += net_income_usd
  }

  return {
    year,
    generated_at: new Date().toISOString(),
    organization_id,
    organization_name: (orgRow as { name?: string | null } | null)?.name ?? null,
    aircraft,
    total_revenue_usd: round2(total_revenue_usd),
    total_expense_usd: round2(total_expense_usd),
    total_depreciation_usd: round2(total_depreciation_usd),
    total_net_income_usd: round2(total_net_income_usd),
  }
}

function round2(n: number) { return Math.round(n * 100) / 100 }
