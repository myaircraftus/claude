/**
 * Owner-side per-WO chat. Mirror of /api/work-orders/[id]/messages but
 * authenticated as a portal-customer (no shop org membership required).
 *
 * GET  → returns thread_messages for the WO. Empty array if no thread
 *        exists yet (lazy-created on first message).
 * POST → creates the thread on first call, inserts the owner's message
 *        with sender_role implicit in created_by metadata. Same payload
 *        contract as the shop endpoint:
 *          { content?: string, attachments?: Attachment[] }
 *
 * Shared timeline: a mechanic posting on the shop side and an owner
 * posting here both land in the same conversation_threads row + its
 * thread_messages, sorted by created_at. One conversation, two doors.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveOwnerContext, getOwnerScopedWorkOrder } from '@/lib/auth/owner-portal'
import { createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveOwnerContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wo = await getOwnerScopedWorkOrder(ctx, params.id)
  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!wo.thread_id) return NextResponse.json({ messages: [] })

  const service = createServiceSupabase()
  const limit = Math.min(
    500,
    Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '100', 10)),
  )

  const { data, error } = await service
    .from('thread_messages')
    .select(
      `id, thread_id, role, content, intent, artifact_type, artifact_id, metadata,
       attachments, created_at,
       sender:created_by (id, full_name, email, avatar_url)`,
    )
    .eq('thread_id', wo.thread_id)
    .eq('organization_id', wo.organization_id)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveOwnerContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wo = await getOwnerScopedWorkOrder(ctx, params.id)
  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  const attachments = Array.isArray(body?.attachments) ? body.attachments : []
  if (!content && attachments.length === 0) {
    return NextResponse.json({ error: 'content or attachments required' }, { status: 400 })
  }
  if (content.length > 4000) {
    return NextResponse.json({ error: 'content too long (max 4000)' }, { status: 400 })
  }

  const service = createServiceSupabase()
  let threadId = wo.thread_id

  // Lazy-create the thread on the owner's first message. The shop side
  // uses the same pattern; either side creating it works.
  if (!threadId) {
    const { data: thread, error: threadErr } = await service
      .from('conversation_threads')
      .insert({
        organization_id: wo.organization_id,
        title: `Work Order ${params.id}`,
        thread_type: 'maintenance',
        aircraft_id: wo.aircraft_id,
        active_artifact_type: 'work_order',
        active_artifact_id: wo.id,
        created_by: ctx.userId,
      })
      .select('id')
      .single()
    if (threadErr || !thread) {
      return NextResponse.json(
        { error: threadErr?.message ?? 'Failed to create thread' },
        { status: 500 },
      )
    }
    threadId = (thread as { id: string }).id
    await service
      .from('work_orders')
      .update({ thread_id: threadId, updated_at: new Date().toISOString() })
      .eq('id', wo.id)
      .eq('organization_id', wo.organization_id)
  }

  const { data: message, error: msgErr } = await service
    .from('thread_messages')
    .insert({
      thread_id: threadId,
      organization_id: wo.organization_id,
      role: 'user',
      content,
      intent: body?.intent ?? null,
      artifact_type: 'work_order',
      artifact_id: wo.id,
      // Tag the message so the shop UI can distinguish "from owner" vs
      // "from mechanic" — thread_messages itself doesn't carry persona.
      metadata: { ...(body?.metadata ?? {}), sender_persona: 'owner' },
      attachments: attachments.length > 0 ? attachments : null,
      created_by: ctx.userId,
    })
    .select(
      `id, thread_id, role, content, intent, artifact_type, artifact_id, metadata,
       attachments, created_at,
       sender:created_by (id, full_name, email, avatar_url)`,
    )
    .single()

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })
  return NextResponse.json(message, { status: 201 })
}
