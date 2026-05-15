/**
 * Owner Economics — operating-cost calculations.
 *
 * Pure math, no I/O. Shared by the Operating Cost form (live summary
 * card) and the Economics dashboard (per-aircraft cost/hr). Every input
 * is optional/nullable — a blank field counts as 0.
 */

export interface OperatingCostInputs {
  fuel_burn_gph?: number | string | null
  fuel_price_per_gal?: number | string | null
  oil_burn_qph?: number | string | null
  oil_price_per_qt?: number | string | null
  engine_reserve_per_hr?: number | string | null
  prop_reserve_per_hr?: number | string | null
  scheduled_maint_per_hr?: number | string | null
  unscheduled_maint_per_hr?: number | string | null
  insurance_per_year?: number | string | null
  annual_fixed_cost?: number | string | null
  tiedown_per_month?: number | string | null
  expected_annual_hours?: number | string | null
  is_leased?: boolean | null
  lease_per_month?: number | string | null
  selling_rate_per_hr?: number | string | null
  rental_type?: string | null
}

export interface OperatingCostResult {
  fuelCostPerHr: number
  oilCostPerHr: number
  reservePerHr: number
  annualFixedTotal: number
  fixedPerHr: number
  leasePerHr: number
  dryCostPerHr: number
  wetCostPerHr: number
  monthlyEst: number
  annualEst: number
  /** 0 when no selling rate is set. */
  sellingRate: number
  profitPerHr: number
  marginPct: number
  hasSellingRate: boolean
}

/** Coerce any field to a non-negative finite number; blanks → 0. */
function num(v: unknown): number {
  const x = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(x) && x > 0 ? x : 0
}

const DEFAULT_ANNUAL_HOURS = 150

export function computeOperatingCost(input: OperatingCostInputs): OperatingCostResult {
  const fuelCostPerHr = num(input.fuel_burn_gph) * num(input.fuel_price_per_gal)
  const oilCostPerHr = num(input.oil_burn_qph) * num(input.oil_price_per_qt)

  const reservePerHr =
    num(input.engine_reserve_per_hr) +
    num(input.prop_reserve_per_hr) +
    num(input.scheduled_maint_per_hr) +
    num(input.unscheduled_maint_per_hr)

  const leaseAnnual = input.is_leased ? num(input.lease_per_month) * 12 : 0
  const annualFixedTotal =
    num(input.insurance_per_year) +
    num(input.annual_fixed_cost) +
    num(input.tiedown_per_month) * 12 +
    leaseAnnual

  // Guard against divide-by-zero — a blank "expected hours" falls back to 150.
  const expectedHours = num(input.expected_annual_hours) || DEFAULT_ANNUAL_HOURS

  const fixedPerHr = annualFixedTotal / expectedHours
  const leasePerHr = leaseAnnual / expectedHours

  const dryCostPerHr = oilCostPerHr + reservePerHr + fixedPerHr
  const wetCostPerHr = dryCostPerHr + fuelCostPerHr

  const monthlyEst = wetCostPerHr * (expectedHours / 12)
  const annualEst = wetCostPerHr * expectedHours

  const sellingRate = num(input.selling_rate_per_hr)
  const hasSellingRate = sellingRate > 0
  const basis = input.rental_type === 'wet' ? wetCostPerHr : dryCostPerHr
  const profitPerHr = hasSellingRate ? sellingRate - basis : 0
  const marginPct = hasSellingRate ? (profitPerHr / sellingRate) * 100 : 0

  return {
    fuelCostPerHr,
    oilCostPerHr,
    reservePerHr,
    annualFixedTotal,
    fixedPerHr,
    leasePerHr,
    dryCostPerHr,
    wetCostPerHr,
    monthlyEst,
    annualEst,
    sellingRate,
    profitPerHr,
    marginPct,
    hasSellingRate,
  }
}

/** USD formatter — whole dollars. */
export function usd0(n: number): string {
  if (!Number.isFinite(n)) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

/** USD formatter — cents. */
export function usd2(n: number): string {
  if (!Number.isFinite(n)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

/** The numeric operating-cost fields the form edits + the API persists. */
export const OPERATING_COST_FIELDS = [
  'fuel_burn_gph',
  'fuel_price_per_gal',
  'oil_burn_qph',
  'oil_price_per_qt',
  'engine_reserve_per_hr',
  'prop_reserve_per_hr',
  'scheduled_maint_per_hr',
  'unscheduled_maint_per_hr',
  'insurance_per_year',
  'annual_fixed_cost',
  'tiedown_per_month',
  'expected_annual_hours',
  'lease_per_month',
  'selling_rate_per_hr',
] as const

export type OperatingCostField = (typeof OPERATING_COST_FIELDS)[number]
