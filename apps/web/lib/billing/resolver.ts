/**
 * Billing rate resolver (Spec 3.1).
 *
 * Single read path for "what labor rate / discount / tax applies to this
 * aircraft × department?". Callers (Invoice line generator, WO total
 * recompute, Estimate builder) MUST go through here — never branch on
 * aircraft_pricing inline.
 *
 * Resolution order:
 *   1. aircraft_pricing.contract_rates[department].labor_rate
 *   2. organizations.default_labor_rate (column doesn't exist yet —
 *      logged 3.1 follow-up; today returns the explicit fallback param)
 *   3. fallback rate the caller supplies (typically the org's UI-config
 *      default, e.g. $125/hr)
 *
 * Discount:
 *   1. aircraft_pricing.default_discount_pct
 *   2. 0
 *
 * Tax:
 *   1. aircraft_pricing.tax_override (rate + jurisdiction)
 *   2. caller-supplied tax profile
 *   3. zero tax
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AircraftPricing, ContractRate, LaborDepartment, TaxProfile,
} from '@/types'

export interface ResolvedRate {
  /** Hourly rate before discount + tax. */
  labor_rate: number
  /** Discount pct, 0-100. */
  discount_pct: number
  /** Tax to apply (rate + jurisdiction + exempt flag). */
  tax: TaxProfile
  /** Source — useful for the line-item provenance display. */
  source: 'contract' | 'org_default' | 'fallback'
}

interface ResolveArgs {
  supabase: SupabaseClient
  organization_id: string
  aircraft_id: string
  department: LaborDepartment
  /** Default rate when no contract row exists. */
  fallback_rate: number
  /** Default tax when no override exists. */
  fallback_tax?: TaxProfile
}

export async function resolveLaborRate(args: ResolveArgs): Promise<ResolvedRate> {
  const { data } = await args.supabase
    .from('aircraft_pricing')
    .select('contract_rates, default_discount_pct, tax_override')
    .eq('aircraft_id', args.aircraft_id)
    .maybeSingle()
  const pricing = (data ?? null) as Pick<AircraftPricing, 'contract_rates' | 'default_discount_pct' | 'tax_override'> | null

  const contract = pricing?.contract_rates?.find((r: ContractRate) => r.department === args.department) ?? null
  const labor_rate = contract && Number.isFinite(contract.labor_rate)
    ? Number(contract.labor_rate)
    : args.fallback_rate

  const discount_pct = pricing?.default_discount_pct ?? 0

  const tax: TaxProfile = pricing?.tax_override ?? args.fallback_tax ?? {
    rate: 0, jurisdiction: '', exempt: true,
  }

  return {
    labor_rate,
    discount_pct,
    tax,
    source: contract ? 'contract' : 'fallback',
  }
}

/**
 * Apply discount + tax to a labor amount in a single pass. Returns the
 * net (post-tax) amount + the breakdown for the invoice line.
 */
export interface ComputedLine {
  gross: number
  discount_amount: number
  net_before_tax: number
  tax_amount: number
  net_after_tax: number
}

export function applyDiscountAndTax(
  gross: number,
  discount_pct: number,
  tax: TaxProfile,
): ComputedLine {
  const safeGross = Number.isFinite(gross) ? Math.max(0, gross) : 0
  const discount_amount = safeGross * (discount_pct / 100)
  const net_before_tax = safeGross - discount_amount
  const tax_rate = tax.exempt ? 0 : (tax.rate ?? 0)
  const tax_amount = net_before_tax * (tax_rate / 100)
  return {
    gross: round2(safeGross),
    discount_amount: round2(discount_amount),
    net_before_tax: round2(net_before_tax),
    tax_amount: round2(tax_amount),
    net_after_tax: round2(net_before_tax + tax_amount),
  }
}

function round2(n: number) { return Math.round(n * 100) / 100 }
