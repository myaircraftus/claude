import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import { createServiceSupabase } from '@/lib/supabase/server'
import { postMessage } from '@/lib/portal/messaging'

async function authorizeOrgForThread(
  service: ReturnType<typeof createServiceSupabase>,
  orgId: string,
  threadId: string
) {
  const { data: thread } = await service
    .from('portal_threads')
    .select('id, organization_id, customer_id')
    .eq('id', threadId)
    .maybeSingle()
  if (!thread || thread.organization_id !== orgId) return null
  return thread
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()
  const thread = await authorizeOrgForThread(service, ctx.organizationId, params.id)
  if (!thread) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: messages } = await service
    .from('portal_messages')
    .select('id, thread_id, sender_user_id, sender_role, body, created_at')
    .eq('thread_id', params.id)
    .order('created_at', { ascending: true })
    .limit(500)

  return NextResponse.json({ messages: messages ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const text = typeof body.body === 'string' ? body.body : ''
  if (!text.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const service = createServiceSupabase()
  const thread = await authorizeOrgForThread(service, ctx.organizationId, params.id)
  if (!thread) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const message = await postMessage(service, {
      threadId: thread.id,
      senderUserId: ctx.user.id,
      senderRole: 'mechanic',
      body: text,
    })
    return NextResponse.json({ message })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed' }, { status: 500 })
  }
}
