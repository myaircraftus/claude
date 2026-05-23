/**
 * GET /api/admin/faa-lookup/[tail]
 *
 * Admin-only convenience endpoint that fetches the FAA Civil Aviation
 * Registry record for a given N-number via lib/faa/registry-lookup.
 *
 * Used by future admin tools (and the data-quality.tail-number-validator
 * + data-quality.aircraft-year-backfiller agents once they're upgraded
 * to consume live registry data). The 12h cache lives in
 * faa_registry_cache.
 *
 * Returns 403 for non-admins; 400 for malformed N-numbers.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { fetchFaaRegistry } from '@/lib/faa/registry-lookup'
import { isValidTailNumber } from '@/lib/faa/registry'

export const runtime = 'nodejs'
export const maxDuration = 15

export async function GET(req: NextRequest, { params }: { params: { tail: string } }) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = Boolean((profile as { is_platform_admin?: boolean } | null)?.is_platform_admin)
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!isValidTailNumber(params.tail)) {
    return NextResponse.json({ error: 'Invalid tail number' }, { status: 400 })
  }
  const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1'
  const service = createServiceSupabase()
  const result = await fetchFaaRegistry({
    supabase: service,
    tailNumber: params.tail,
    forceRefresh,
  })
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, status: result.status },
      { status: 502 },
    )
  }
  return NextResponse.json({
    ok: true,
    cached: result.cached,
    parsed: result.parsed,
  })
}
