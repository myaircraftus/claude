import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getOrCreateThread } from '@/lib/portal/messaging'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customerId = req.nextUrl.searchParams.get('customer_id')
  const service = createServiceSupabase()

  let query = service
    .from('portal_threads')
    .select('id, organization_id, customer_id, last_message_at, last_message_snippet, created_at')
    .eq('organization_id', ctx.organizationId)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  if (customerId) query = query.eq('customer_id', customerId)

  const { data: threads } = await query
  return NextResponse.json({ threads: threads ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const customerId = typeof body.customer_id === 'string' ? body.customer_id : null
  if (!customerId) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  const service = createServiceSupabase()
  const { data: customer } = await service
    .from('customers')
    .select('id, organization_id')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer || customer.organization_id !== ctx.organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const thread = await getOrCreateThread(service, ctx.organizationId, customer.id)
  return NextResponse.json({ thread })
}
