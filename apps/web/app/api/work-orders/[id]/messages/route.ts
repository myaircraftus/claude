import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  // Check work order exists and belongs to org
  const { data: wo } = await supabase
    .from('work_orders')
    .select('id, thread_id')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!wo.thread_id) return NextResponse.json({ messages: [] })

  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)
  const before = searchParams.get('before')

  let query = supabase
    .from('thread_messages')
    .select(`
      id, thread_id, role, content, intent, artifact_type, artifact_id, metadata,
      attachments, created_at,
      sender:created_by (id, full_name, email, avatar_url)
    `)
    .eq('thread_id', wo.thread_id)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ messages: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  // Fetch work order
  const { data: wo } = await supabase
    .from('work_orders')
    .select('id, thread_id, aircraft_id, customer_id')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  if (!body.content && (!body.attachments || body.attachments.length === 0)) {
    return NextResponse.json({ error: 'content or attachments required' }, { status: 400 })
  }

  let threadId = wo.thread_id

  // Create thread if none exists
  if (!threadId) {
    const { data: thread, error: threadErr } = await supabase
      .from('conversation_threads')
      .insert({
        organization_id: orgId,
        title: `Work Order ${params.id}`,
        thread_type: 'maintenance',
        aircraft_id: wo.aircraft_id,
        customer_id: wo.customer_id,
        active_artifact_type: 'work_order',
        active_artifact_id: wo.id,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (threadErr || !thread) {
      return NextResponse.json({ error: threadErr?.message ?? 'Failed to create thread' }, { status: 500 })
    }

    threadId = thread.id

    // Link thread to work order
    await supabase
      .from('work_orders')
      .update({ thread_id: threadId, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('organization_id', orgId)
  }

  // Insert message
  const { data: message, error: msgErr } = await supabase
    .from('thread_messages')
    .insert({
      thread_id: threadId,
      organization_id: orgId,
      role: 'user',
      content: body.content ?? '',
      intent: body.intent ?? null,
      artifact_type: 'work_order',
      artifact_id: wo.id,
      metadata: body.metadata ?? {},
      attachments: body.attachments ?? null,
      created_by: ctx.user.id,
    })
    .select(`
      id, thread_id, role, content, intent, artifact_type, artifact_id, metadata,
      attachments, created_at,
      sender:created_by (id, full_name, email, avatar_url)
    `)
    .single()

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

  return NextResponse.json(message, { status: 201 })
}
