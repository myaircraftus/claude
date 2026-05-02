import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { postMessage } from '@/lib/portal/messaging'

async function authorizeOwnerForThread(
  service: ReturnType<typeof createServiceSupabase>,
  userId: string,
  threadId: string
) {
  const { data: thread } = await service
    .from('portal_threads')
    .select('id, customer_id, organization_id')
    .eq('id', threadId)
    .maybeSingle()
  if (!thread) return null

  const { data: customer } = await service
    .from('customers')
    .select('id, portal_user_id, portal_access')
    .eq('id', thread.customer_id)
    .maybeSingle()
  if (!customer || customer.portal_user_id !== userId || !customer.portal_access) {
    return null
  }
  return thread
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()
  const thread = await authorizeOwnerForThread(service, user.id, params.id)
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
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const text = typeof body.body === 'string' ? body.body : ''
  if (!text.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const service = createServiceSupabase()
  const thread = await authorizeOwnerForThread(service, user.id, params.id)
  if (!thread) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const message = await postMessage(service, {
      threadId: thread.id,
      senderUserId: user.id,
      senderRole: 'owner',
      body: text,
    })
    return NextResponse.json({ message })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed' }, { status: 500 })
  }
}
