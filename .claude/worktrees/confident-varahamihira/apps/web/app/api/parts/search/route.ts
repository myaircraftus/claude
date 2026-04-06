import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { runPartsSearch } from '@/lib/parts/search'
import { canWriteParts } from '@/lib/parts/permissions'
import type { OrgRole } from '@/types'

const searchSchema = z.object({
  query: z.string().min(1).max(200).transform(v => v.trim()),
  aircraft_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  maintenance_draft_id: z.string().uuid().nullable().optional(),
  sort: z.enum(['best_match', 'best_price', 'fastest_delivery', 'best_condition', 'top_rated']).optional(),
  filters: z.object({
    condition: z.array(z.enum(['new', 'used', 'overhauled', 'serviceable', 'unknown'])).optional(),
    vendors: z.array(z.string()).optional(),
    price_min: z.number().nullable().optional(),
    price_max: z.number().nullable().optional(),
  }).optional(),
})

// Simple in-memory rate limiting: max 10 searches per org per minute
const searchCounts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(orgId: string): boolean {
  const now = Date.now()
  const entry = searchCounts.get(orgId)
  if (!entry || now > entry.resetAt) {
    searchCounts.set(orgId, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    if (!canWriteParts(membership.role as OrgRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    if (!checkRateLimit(membership.organization_id)) {
      return NextResponse.json({ error: 'Too many searches — please wait a moment' }, { status: 429 })
    }

    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = searchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    const { query, aircraft_id, work_order_id, sort, filters } = parsed.data

    // Optionally enrich with aircraft context
    let aircraftContext: { aircraftId?: string; tailNumber?: string; make?: string; model?: string; engineModel?: string } | undefined
    if (aircraft_id) {
      const { data: aircraft } = await supabase
        .from('aircraft')
        .select('id, tail_number, make, model, engine_model')
        .eq('id', aircraft_id)
        .eq('organization_id', membership.organization_id)
        .single()
      if (aircraft) {
        aircraftContext = {
          aircraftId: aircraft.id,
          tailNumber: aircraft.tail_number,
          make: aircraft.make,
          model: aircraft.model,
          engineModel: aircraft.engine_model ?? undefined,
        }
      }
    }

    const result = await runPartsSearch({
      organizationId: membership.organization_id,
      userId: user.id,
      input: {
        query,
        aircraftContext,
        workOrderId: work_order_id ?? undefined,
        filters: filters ? {
          condition: filters.condition,
          vendors: filters.vendors,
          priceMin: filters.price_min,
          priceMax: filters.price_max,
        } : undefined,
      },
      sortMode: sort ?? 'best_match',
    })

    // Audit log
    await supabase.from('audit_logs').insert({
      organization_id: membership.organization_id,
      user_id: user.id,
      action: 'part.search_run',
      entity_type: 'atlas_part_search',
      entity_id: result.searchId.startsWith('tmp-') ? null : result.searchId as unknown as string,
      metadata_json: {
        query,
        result_count: result.summary.count,
        providers_used: result.summary.providersUsed,
        aircraft_id: aircraft_id ?? null,
      },
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[POST /api/parts/search] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
