/**
 * GET /api/work-orders/messages-unread
 *
 * Returns a lightweight roll-up the bubble polls every ~10s to drive the
 * unread badge:
 *   {
 *     organizations: { latest_message_at: '2026-04-29T...', work_order_id: '...', preview: 'Hey...' } | null
 *     per_thread: { thread_id: 'iso' }
 *   }
 *
 * The client compares latest_message_at against the highest "last seen"
 * timestamp it has stored in localStorage and shows a red dot on the
 * bubble if a newer message exists.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()

  // Most recent thread_message in this org (across all WOs the user has access to).
  // Cheap: indexed scan on (organization_id, created_at).
  const { data: latest } = await service
    .from('thread_messages')
    .select('thread_id, content, created_at')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) {
    return NextResponse.json({ latest: null, per_thread: {} })
  }

  // Map back to a WO so the client can deeplink. Many threads map to a WO via
  // work_orders.thread_id; we look it up.
  const { data: wo } = await service
    .from('work_orders')
    .select('id, work_order_number, aircraft_id')
    .eq('thread_id', latest.thread_id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

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
