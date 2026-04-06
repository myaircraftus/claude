import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getOrdersForOrg } from '@/lib/parts/orders'
import type { PartOrderStatus } from '@/lib/parts/types'

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url)
    const aircraftId = searchParams.get('aircraft_id') ?? undefined
    const workOrderId = searchParams.get('work_order_id') ?? undefined
    const status = searchParams.get('status') as PartOrderStatus | undefined
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)
    const offset = parseInt(searchParams.get('offset') ?? '0')

    const orders = await getOrdersForOrg(membership.organization_id, {
      aircraftId,
      workOrderId,
      status,
      limit,
      offset,
    })

    return NextResponse.json(orders)
  } catch (err) {
    console.error('[GET /api/parts/orders] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
