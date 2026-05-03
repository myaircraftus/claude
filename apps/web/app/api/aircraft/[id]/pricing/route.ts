/**
 * /api/aircraft/[id]/pricing  (Spec 3.1)
 *
 *   GET → returns the AircraftPricing row, or null if no overrides set.
 *   PUT → upsert on aircraft_id (single-row pattern).
 *
 * Owner+/admin only for writes; org members for reads. Same RLS policies
 * fire on the DB side.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import type {
  AircraftPricing, ContractRate, LaborDepartment, TaxProfile, BillingProfile, SplitBilling,
} from '@/types'

export const dynamic = 'force-dynamic'

const VALID_DEPTS = new Set<LaborDepartment>(['airframe', 'engine', 'avionics', 'interior', 'shop'])
const WRITE_ROLES = new Set(['owner', 'admin'])

interface PutBody {
  contract_rates?: ContractRate[]
  default_discount_pct?: number
  tax_override?: TaxProfile | null
  billing_profile?: BillingProfile | null
  split_billing?: SplitBilling | null
}

function sanitize(body: PutBody): Partial<Pick<AircraftPricing,
  'contract_rates' | 'default_discount_pct' | 'tax_override' | 'billing_profile' | 'split_billing'
>> {
  const out: Partial<Pick<AircraftPricing, 'contract_rates' | 'default_discount_pct' | 'tax_override' | 'billing_profile' | 'split_billing'>> = {}

  if (Array.isArray(body.contract_rates)) {
    out.contract_rates = body.contract_rates
      .filter((r): r is ContractRate => r && VALID_DEPTS.has(r.department) && Number.isFinite(r.labor_rate) && r.labor_rate >= 0)
      .map((r) => ({ department: r.department, labor_rate: Math.round(r.labor_rate * 100) / 100 }))
  }
  if (typeof body.default_discount_pct === 'number' && Number.isFinite(body.default_discount_pct)) {
    out.default_discount_pct = Math.max(0, Math.min(100, Math.round(body.default_discount_pct * 100) / 100))
  }
  if (body.tax_override && typeof body.tax_override === 'object') {
    const t = body.tax_override
    out.tax_override = {
      rate: Number.isFinite(t.rate) ? Math.max(0, Math.min(100, t.rate)) : 0,
      jurisdiction: typeof t.jurisdiction === 'string' ? t.jurisdiction.slice(0, 100) : '',
      exempt: !!t.exempt,
      exemption_id: typeof t.exemption_id === 'string' ? t.exemption_id.slice(0, 100) : null,
    }
  } else if (body.tax_override === null) out.tax_override = null

  if (body.billing_profile && typeof body.billing_profile === 'object') {
    const b = body.billing_profile
    out.billing_profile = {
      term_days: Number.isFinite(b.term_days) ? Math.max(0, Math.min(180, Math.floor(b.term_days))) : 30,
      po_required: !!b.po_required,
      email_invoice_to: Array.isArray(b.email_invoice_to)
        ? b.email_invoice_to.filter((e): e is string => typeof e === 'string').slice(0, 10)
        : [],
    }
  } else if (body.billing_profile === null) out.billing_profile = null

  if (body.split_billing && Array.isArray(body.split_billing.customers)) {
    const list = body.split_billing.customers
      .filter((c): c is { customer_id: string; percentage: number } =>
        c && typeof c.customer_id === 'string' && Number.isFinite(c.percentage) && c.percentage > 0)
      .slice(0, 10)
    const sum = list.reduce((s, c) => s + c.percentage, 0)
    if (Math.abs(sum - 100) > 0.01) {
      throw new Error(`Split billing percentages must sum to 100 (got ${sum.toFixed(2)})`)
    }
    out.split_billing = { customers: list }
  } else if (body.split_billing === null) out.split_billing = null

  return out
}

async function loadOrgScopedAircraft(supabase: ReturnType<typeof createServerSupabase>, organizationId: string, aircraftId: string) {
  const { data } = await supabase
    .from('aircraft')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('id', aircraftId)
    .maybeSingle()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  if (!(await loadOrgScopedAircraft(supabase, membership.organization_id, params.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data } = await supabase
    .from('aircraft_pricing')
    .select('*')
    .eq('aircraft_id', params.id)
    .maybeSingle()
  return NextResponse.json({ pricing: (data as AircraftPricing | null) ?? null })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!WRITE_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  if (!(await loadOrgScopedAircraft(supabase, membership.organization_id, params.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: PutBody
  try { body = (await req.json()) as PutBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  let sanitized: Partial<Pick<AircraftPricing, 'contract_rates' | 'default_discount_pct' | 'tax_override' | 'billing_profile' | 'split_billing'>>
  try { sanitized = sanitize(body) } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid pricing' }, { status: 400 })
  }

  const upsertRow = {
    aircraft_id: params.id,
    organization_id: membership.organization_id,
    contract_rates: sanitized.contract_rates ?? [],
    default_discount_pct: sanitized.default_discount_pct ?? 0,
    tax_override: sanitized.tax_override ?? null,
    billing_profile: sanitized.billing_profile ?? null,
    split_billing: sanitized.split_billing ?? null,
  }

  const { data, error } = await supabase
    .from('aircraft_pricing')
    .upsert(upsertRow, { onConflict: 'aircraft_id' })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pricing: data as AircraftPricing })
}
