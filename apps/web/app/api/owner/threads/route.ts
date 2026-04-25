import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { getOrCreateThread } from '@/lib/portal/messaging'

export async function GET(_req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()

  const { data: customers } = await service
    .from('customers')
    .select('id, organization_id')
    .eq('portal_user_id', user.id)
    .eq('portal_access', true)

  const customerIds = (customers ?? []).map((c: { id: string }) => c.id)
  if (customerIds.length === 0) return NextResponse.json({ threads: [] })

  const { data: threads } = await service
    .from('portal_threads')
    .select(
      'id, organization_id, customer_id, last_message_at, last_message_snippet, created_at'
    )
    .in('customer_id', customerIds)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  return NextResponse.json({ threads: threads ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const customerId = typeof body.customer_id === 'string' ? body.customer_id : null
  if (!customerId) {
    return NextResponse.json({ error: 'customer_id required' }, { status: 400 })
  }

  const service = createServiceSupabase()
  const { data: customer } = await service
    .from('customers')
    .select('id, organization_id, portal_user_id, portal_access')
    .eq('id', customerId)
    .maybeSingle()

  if (!customer || customer.portal_user_id !== user.id || !customer.portal_access) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const thread = await getOrCreateThread(service, customer.organization_id, customer.id)
  return NextResponse.json({ thread })
}
