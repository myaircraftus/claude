/**
 * GET /api/owner/work-orders/messages-unread
 *
 * Owner-side mirror of /api/work-orders/messages-unread. Returns the most
 * recent thread_message landing on any work order whose aircraft this
 * portal-customer user owns. Same shape as the shop endpoint so the
 * WorkOrderChatBubble polling logic doesn't have to branch.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveOwnerContext, getOwnerAircraftIds } from '@/lib/auth/owner-portal'
import { createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await resolveOwnerContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const aircraftIds = await getOwnerAircraftIds(ctx)
  if (aircraftIds.length === 0) return NextResponse.json({ latest: null })

  const service = createServiceSupabase()

  // Pull WO thread ids the owner can see (one query, indexed).
  const { data: ownedWos } = await service
    .from('work_orders')
    .select('id, work_order_number, aircraft_id, thread_id, organization_id')
    .in('aircraft_id', aircraftIds)
    .not('thread_id', 'is', null)
  const wosByThread = new Map<string, (typeof ownedWos)[number]>()
  for (const wo of ownedWos ?? []) {
    if (wo.thread_id) wosByThread.set(wo.thread_id, wo)
  }
  const threadIds = Array.from(wosByThread.keys())
  if (threadIds.length === 0) return NextResponse.json({ latest: null })

  const { data: latest } = await service
    .from('thread_messages')
    .select('thread_id, content, created_at')
    .in('thread_id', threadIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) return NextResponse.json({ latest: null })

  const wo = wosByThread.get(latest.thread_id)
  return NextResponse.json({
    latest: {
      thread_id: latest.thread_id,
      created_at: latest.created_at,
      preview: (latest.content ?? '').slice(0, 120),
      work_order_id: wo?.id ?? null,
      work_order_number: wo?.work_order_number ?? null,
      aircraft_id: wo?.aircraft_id ?? null,
    },
  })
}
