// POST /api/parts/search
// Runs AI part resolution + SerpAPI + eBay providers, normalizes, ranks, persists.

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { searchParts } from '@/lib/parts/search'
import type { AircraftContext } from '@/lib/parts/ai-resolve'
import type {
  ConditionFilter,
  ShippingFilter,
  VendorBucketFilter,
  SortMode,
  PartsSearchFilters,
} from '@/lib/parts/types'

// ─── Filter validation ─────────────────────────────────────────────────────
const VALID_CONDITION: ConditionFilter[] = ['any', 'new', 'pma', 'overhauled', 'serviceable', 'used']
const VALID_SHIPPING: ShippingFilter[] = ['any', 'in_stock', 'next_day', 'two_day', 'this_week']
const VALID_VENDOR_BUCKET: VendorBucketFilter[] = ['any', 'aviation_trusted']
const VALID_SORT: SortMode[] = ['best_fit', 'price_asc', 'price_desc', 'fastest', 'highest_rated']

function parseFilters(raw: any): PartsSearchFilters | null {
  if (!raw || typeof raw !== 'object') return null
  const out: PartsSearchFilters = {}
  if (typeof raw.condition === 'string' && (VALID_CONDITION as string[]).includes(raw.condition)) {
    out.condition = raw.condition as ConditionFilter
  }
  if (typeof raw.priceMin === 'number' && Number.isFinite(raw.priceMin)) out.priceMin = raw.priceMin
  if (typeof raw.priceMax === 'number' && Number.isFinite(raw.priceMax)) out.priceMax = raw.priceMax
  if (typeof raw.shipping === 'string' && (VALID_SHIPPING as string[]).includes(raw.shipping)) {
    out.shipping = raw.shipping as ShippingFilter
  }
  if (typeof raw.vendorBucket === 'string' && (VALID_VENDOR_BUCKET as string[]).includes(raw.vendorBucket)) {
    out.vendorBucket = raw.vendorBucket as VendorBucketFilter
  }
  if (typeof raw.brand === 'string') out.brand = raw.brand.slice(0, 64)
  if (typeof raw.partNumber === 'string') out.partNumber = raw.partNumber.slice(0, 64).toUpperCase()
  if (typeof raw.sortBy === 'string' && (VALID_SORT as string[]).includes(raw.sortBy)) {
    out.sortBy = raw.sortBy as SortMode
  }
  return Object.keys(out).length > 0 ? out : null
}

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const user = ctx.user
  const orgId = ctx.organizationId

  const body = await req.json()
  const query = String(body.query ?? '').trim()
  if (!query) return NextResponse.json({ error: 'Query is required' }, { status: 400 })
  if (query.length > 200) return NextResponse.json({ error: 'Query too long' }, { status: 400 })

  // Fetch full aircraft context for AI resolution (not just make/model)
  let aircraftMakeModel: string | null = null
  let aircraftYear: number | null = null
  let engineModel: string | null = null
  let aircraftContext: AircraftContext | null = null

  if (body.aircraft_id) {
    const { data: ac } = await supabase
      .from('aircraft')
      .select('tail_number, make, model, year, serial_number, engine_make, engine_model, engine_serial, prop_make, prop_model')
      .eq('id', body.aircraft_id)
      .single()

    if (ac) {
      aircraftMakeModel = [ac.make, ac.model].filter(Boolean).join(' ') || null
      aircraftYear = ac.year ?? null
      engineModel = [ac.engine_make, ac.engine_model].filter(Boolean).join(' ') || null

      // Build full context for AI resolution
      aircraftContext = {
        tailNumber: ac.tail_number,
        make: ac.make ?? 'Unknown',
        model: ac.model ?? 'Unknown',
        year: ac.year,
        serialNumber: ac.serial_number,
        engineMake: ac.engine_make,
        engineModel: ac.engine_model,
        engineSerial: ac.engine_serial,
        propMake: ac.prop_make,
        propModel: ac.prop_model,
      }
    }
  }

  if (!aircraftContext && body.aircraft_context && typeof body.aircraft_context === 'object') {
    const context = body.aircraft_context as Partial<AircraftContext>
    const make = typeof context.make === 'string' ? context.make.trim() : ''
    const model = typeof context.model === 'string' ? context.model.trim() : ''

    aircraftMakeModel = [make, model].filter(Boolean).join(' ') || null
    aircraftYear = typeof context.year === 'number' ? context.year : null
    engineModel = [context.engineMake, context.engineModel]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ') || null

    if (typeof context.tailNumber === 'string' && context.tailNumber.trim()) {
      aircraftContext = {
        tailNumber: context.tailNumber.trim(),
        make: make || 'Unknown',
        model: model || 'Unknown',
        year: typeof context.year === 'number' ? context.year : null,
        serialNumber: typeof context.serialNumber === 'string' ? context.serialNumber : null,
        engineMake: typeof context.engineMake === 'string' ? context.engineMake : null,
        engineModel: typeof context.engineModel === 'string' ? context.engineModel : null,
        engineSerial: typeof context.engineSerial === 'string' ? context.engineSerial : null,
        propMake: typeof context.propMake === 'string' ? context.propMake : null,
        propModel: typeof context.propModel === 'string' ? context.propModel : null,
      }
    }
  }

  try {
    const result = await searchParts(supabase, {
      query,
      organizationId: orgId,
      aircraftId: body.aircraft_id ?? null,
      workOrderId: body.work_order_id ?? null,
      maintenanceDraftId: body.maintenance_draft_id ?? null,
      userId: user.id,
      aircraftMakeModel,
      aircraftYear,
      engineModel,
      aircraftContext,
      maxResults: typeof body.limit === 'number' ? Math.min(body.limit, 50) : 30,
      filters: parseFilters(body.filters),
    })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Search failed' },
      { status: 500 }
    )
  }
}
