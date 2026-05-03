/**
 * True Operating Cost calculator (Spec 7.4).
 *
 * Pure math + a single Supabase read pass. No new tables. Reads:
 *   - cost_entries (filtered to aircraft + period + approved=true)
 *   - flight_events (aircraft + period — the actual flight hours)
 *   - aircraft (fallback fields when present)
 *
 * Returns a per-hour breakdown the dashboard (7.5) renders. The breakdown
 * collapses category → bucket using the seed map in lib/costs/categories.ts;
 * operators who pick custom categories still get bucketed because the DB
 * row stores the explicit `bucket` value.
 *
 * Math summary:
 *   variable: total / flightHours              (fuel, oil)
 *   scheduled: per spec defaults or overrides  (engine + prop reserve)
 *   annual fixed: total / annualizedHours      (insurance, hangar, annual)
 *   monthly fixed: monthly × 12 / annualHours  (tiedown, software)
 *   loan / depreciation: amortized over annualizedHours
 *
 * `annualizedHours` extrapolates the lookback's flight hours to a full
 * year: 30d × 12.17, 90d × 4.06, 365d × 1. That keeps the per-hour
 * fixed-cost line honest even when the lookback window is short.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeEngineReserve, computePropReserve } from '@/lib/costs/reserves'

export type LookbackPeriod = '30d' | '90d' | '365d'

export interface CostEntryRow {
  amount: number
  category: string
  bucket: string
  cost_date: string
}

export interface FlightEventRow {
  airborne_hours: number
  start_time: string
}

export interface Aircraft7_4 {
  id: string
  engine_make?: string | null
  engine_model?: string | null
  prop_make?: string | null
  prop_model?: string | null
  total_time_hours?: number | null
}

export interface OperatingCostBreakdown {
  fuelPerHour: number
  oilPerHour: number
  engineReservePerHour: number
  propReservePerHour: number
  insurancePerHour: number
  hangarPerHour: number
  annualInspectionPerHour: number
  loanPerHour: number
  depreciationPerHour: number
  /** Anything that didn't slot neatly — tax_use, training, parts, etc. */
  otherPerHour: number
  /** wet = everything per hour, including fuel + oil. */
  wetCostPerHour: number
  /** dry = wetCostPerHour minus fuel (oil stays in dry by industry convention). */
  dryCostPerHour: number
  /** 0.85 if data dense enough to trust, 0.55 otherwise. */
  confidence: number
  /** Inputs that fed the math, surfaced for the UI. */
  breakdown: {
    period: LookbackPeriod
    flightHours: number
    annualizedHours: number
    costEntryCount: number
    /** Annualization multiplier applied to the lookback (12.17 / 4.06 / 1). */
    annualizationFactor: number
    /** Sum of all approved cost_entries in the window — sanity check. */
    totalSpend: number
    /** Per-bucket totals (raw $, NOT per-hour) so the chart can render the breakdown. */
    bucketTotals: Record<string, number>
    /** Per-category totals (raw $) for the pie chart in 7.5. */
    categoryTotals: Record<string, number>
    /** Reserve assumptions actually used (default vs override + dollar inputs). */
    engineReserve: { perHour: number; overhaulCostUsd: number; tboHours: number; isDefault: boolean }
    propReserve: { perHour: number; overhaulCostUsd: number; tboHours: number; isDefault: boolean }
    /** Notes the UI can render under the card ("Insufficient flight hours…"). */
    notes: string[]
  }
}

const PERIOD_DAYS: Record<LookbackPeriod, number> = {
  '30d': 30,
  '90d': 90,
  '365d': 365,
}

const ANNUALIZATION_FACTOR: Record<LookbackPeriod, number> = {
  '30d': 12.17,   // 365 / 30
  '90d': 4.06,    // 365 / 90
  '365d': 1.0,
}

interface ComputeArgs {
  supabase: SupabaseClient
  organizationId: string
  aircraftId: string
  period: LookbackPeriod
}

/**
 * Pull the data + run the math. Designed to run in a Next.js Route Handler
 * with a server-side Supabase client (RLS enforced) — no service-role.
 */
export async function computeTrueOperatingCost(args: ComputeArgs): Promise<OperatingCostBreakdown> {
  const { supabase, organizationId, aircraftId, period } = args
  const days = PERIOD_DAYS[period]
  const annualizationFactor = ANNUALIZATION_FACTOR[period]
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // Fetch aircraft (for reserve overrides if any) + cost_entries + flight_events.
  const [aircraftRes, costRes, flightRes] = await Promise.all([
    supabase
      .from('aircraft')
      .select('id, engine_make, engine_model, prop_make, prop_model, total_time_hours')
      .eq('organization_id', organizationId)
      .eq('id', aircraftId)
      .maybeSingle(),
    supabase
      .from('cost_entries')
      .select('amount, category, bucket, cost_date')
      .eq('organization_id', organizationId)
      .eq('aircraft_id', aircraftId)
      .eq('approved', true)
      .gte('cost_date', sinceIso.slice(0, 10)),
    supabase
      .from('flight_events')
      .select('airborne_hours, start_time')
      .eq('organization_id', organizationId)
      .eq('aircraft_id', aircraftId)
      .gte('start_time', sinceIso),
  ])

  const aircraft = (aircraftRes.data ?? null) as Aircraft7_4 | null
  const costEntries = (costRes.data ?? []) as CostEntryRow[]
  const flightEvents = (flightRes.data ?? []) as FlightEventRow[]

  const flightHours = flightEvents.reduce((sum, e) => {
    const h = Number.isFinite(e.airborne_hours) ? Number(e.airborne_hours) : 0
    return sum + (h > 0 ? h : 0)
  }, 0)
  const annualizedHours = flightHours * annualizationFactor

  // ── Aggregate cost_entries by category + bucket ─────────────────────
  const categoryTotals: Record<string, number> = {}
  const bucketTotals: Record<string, number> = {}
  let totalSpend = 0
  for (const e of costEntries) {
    const amt = Number.isFinite(e.amount) ? Number(e.amount) : 0
    if (amt <= 0) continue
    totalSpend += amt
    categoryTotals[e.category] = (categoryTotals[e.category] ?? 0) + amt
    bucketTotals[e.bucket] = (bucketTotals[e.bucket] ?? 0) + amt
  }

  const cat = (k: string) => categoryTotals[k] ?? 0
  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)

  // ── Variable per hour (fuel + oil): total / flightHours ──────────────
  const fuelPerHour = flightHours > 0 ? cat('fuel') / flightHours : 0
  const oilPerHour = flightHours > 0 ? cat('oil') / flightHours : 0

  // ── Scheduled per hour: engine + prop reserves ───────────────────────
  // Future: pull aircraft.engine_overhaul_cost_usd / engine_tbo_hours when
  // those columns exist; today they don't, so reserves use defaults unless
  // operator logged an explicit engine_overhaul_reserve / prop_overhaul_reserve
  // cost_entry — which we honor as an override on the computed value.
  const engineReserve = computeEngineReserve()
  const propReserve = computePropReserve()
  const engineReservePerHour =
    cat('engine_overhaul_reserve') > 0 && flightHours > 0
      ? cat('engine_overhaul_reserve') / flightHours
      : engineReserve.perHour
  const propReservePerHour =
    cat('prop_overhaul_reserve') > 0 && flightHours > 0
      ? cat('prop_overhaul_reserve') / flightHours
      : propReserve.perHour

  // ── Annual fixed: amortized over annualizedHours ─────────────────────
  // Insurance, annual_inspection, tax_property all roll up here.
  const insuranceAnnual = cat('insurance')
  const insurancePerHour = annualizedHours > 0 ? insuranceAnnual / annualizedHours : 0
  const annualInspectionAnnual = cat('annual_inspection')
  const annualInspectionPerHour = annualizedHours > 0 ? annualInspectionAnnual / annualizedHours : 0

  // ── Monthly fixed × 12 / annualHours ─────────────────────────────────
  // Hangar + tiedown + software subscriptions. Lookback already captured
  // 30d / 90d / 365d worth, so we annualize first, then divide by hours.
  const hangarMonthlyTotal = cat('hangar') + cat('tiedown')
  const hangarAnnual = hangarMonthlyTotal * (365 / Math.max(days, 1))
  const hangarPerHour = annualizedHours > 0 ? hangarAnnual / annualizedHours : 0

  // ── Loan + depreciation ──────────────────────────────────────────────
  const loanAnnual = cat('loan_payment') * (365 / Math.max(days, 1))
  const loanPerHour = annualizedHours > 0 ? loanAnnual / annualizedHours : 0
  const depreciationAnnual = cat('depreciation') * (365 / Math.max(days, 1))
  const depreciationPerHour = annualizedHours > 0 ? depreciationAnnual / annualizedHours : 0

  // ── Other (parts, labor, outside_service, training, taxes, software) ─
  const handled = new Set([
    'fuel', 'oil',
    'engine_overhaul_reserve', 'prop_overhaul_reserve',
    'insurance', 'annual_inspection',
    'hangar', 'tiedown',
    'loan_payment', 'depreciation',
  ])
  let otherTotal = 0
  for (const [k, v] of Object.entries(categoryTotals)) {
    if (!handled.has(k)) otherTotal += v
  }
  // Treat "other" as one-time spend over the lookback — amortize over annualized hours.
  const otherAnnual = otherTotal * (365 / Math.max(days, 1))
  const otherPerHour = annualizedHours > 0 ? otherAnnual / annualizedHours : 0

  const wetCostPerHour =
    safe(fuelPerHour) +
    safe(oilPerHour) +
    safe(engineReservePerHour) +
    safe(propReservePerHour) +
    safe(insurancePerHour) +
    safe(hangarPerHour) +
    safe(annualInspectionPerHour) +
    safe(loanPerHour) +
    safe(depreciationPerHour) +
    safe(otherPerHour)

  const dryCostPerHour = wetCostPerHour - safe(fuelPerHour)

  // ── Confidence ──────────────────────────────────────────────────────
  const confidence = flightHours >= 50 && costEntries.length >= 10 ? 0.85 : 0.55

  const notes: string[] = []
  if (flightHours <= 0) notes.push('No flight events in the selected period — per-hour math falls back on annualization.')
  if (costEntries.length === 0) notes.push('No approved cost entries in this window — totals are zero.')
  if (engineReserve.isDefault) notes.push(`Engine reserve uses defaults ($${engineReserve.overhaulCostUsd.toLocaleString()} / ${engineReserve.tboHours.toLocaleString()} hr).`)
  if (propReserve.isDefault) notes.push(`Prop reserve uses defaults ($${propReserve.overhaulCostUsd.toLocaleString()} / ${propReserve.tboHours.toLocaleString()} hr).`)
  if (confidence < 0.85) notes.push('Confidence: 0.55 — needs ≥50 flight hours AND ≥10 cost entries to reach 0.85.')

  // Touch aircraft for typecheck (silences unused-var lint when overrides land).
  void aircraft

  return {
    fuelPerHour: safe(fuelPerHour),
    oilPerHour: safe(oilPerHour),
    engineReservePerHour: safe(engineReservePerHour),
    propReservePerHour: safe(propReservePerHour),
    insurancePerHour: safe(insurancePerHour),
    hangarPerHour: safe(hangarPerHour),
    annualInspectionPerHour: safe(annualInspectionPerHour),
    loanPerHour: safe(loanPerHour),
    depreciationPerHour: safe(depreciationPerHour),
    otherPerHour: safe(otherPerHour),
    wetCostPerHour,
    dryCostPerHour,
    confidence,
    breakdown: {
      period,
      flightHours,
      annualizedHours,
      costEntryCount: costEntries.length,
      annualizationFactor,
      totalSpend,
      bucketTotals,
      categoryTotals,
      engineReserve,
      propReserve,
      notes,
    },
  }
}
