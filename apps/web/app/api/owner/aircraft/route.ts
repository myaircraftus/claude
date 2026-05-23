/**
 * GET /api/owner/aircraft
 *
 * Lists every aircraft owned by the calling portal-customer user.
 * Shape matches the shop /api/aircraft response so the WorkOrderChatBubble
 * + AppLayout owner-aircraft fetcher can drop in without changes.
 *
 * Auth: portal_user_id chain (see lib/auth/owner-portal.ts).
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveOwnerContext } from '@/lib/auth/owner-portal'
import { createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await resolveOwnerContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.customerIds.length === 0) return NextResponse.json({ aircraft: [] })

  const service = createServiceSupabase()
  const { data: aircraft, error } = await service
    .from('aircraft')
    .select('id, tail_number, make, model, year, organization_id, owner_customer_id')
    .in('owner_customer_id', ctx.customerIds)
    .eq('is_archived', false)
    .order('tail_number', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ aircraft: aircraft ?? [] })
}
