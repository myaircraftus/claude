/**
 * /api/admin/ops-assistant — Phase 16 Sprint 16.8
 *
 * Chat endpoint for the AI ops assistant. Auth: platform admin only.
 *
 * POST { conversation_id?, message }
 *   → runs lib/ops/assistant.ts:runOpsAssistant, persists user + assistant
 *     + tool messages to ops_assistant_messages, creates a conversation
 *     row if none provided, returns the assistant text + tool trace.
 *
 * GET ?conversation_id=...
 *   → returns the conversation history.
 *
 * Rate limit: 30 queries/min per admin (lightweight in-memory limiter
 * keyed on user_id; resets on cold-start which is fine for v1).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { runOpsAssistant, callAnthropicWithTools } from '@/lib/ops/assistant'

export const dynamic = 'force-dynamic'

interface RateState { windowStart: number; count: number }
const rateMap = new Map<string, RateState>()
const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000

function consumeRate(userId: string): boolean {
  const now = Date.now()
  const cur = rateMap.get(userId)
  if (!cur || now - cur.windowStart > RATE_WINDOW_MS) {
    rateMap.set(userId, { windowStart: now, count: 1 })
    return true
  }
  if (cur.count >= RATE_LIMIT) return false
  cur.count += 1
  return true
}

async function requirePlatformAdmin() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase
    .from('user_profiles').select('is_platform_admin').eq('id', user.id).single()
  if (!profile?.is_platform_admin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user }
}

export async function GET(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if ('error' in guard) return guard.error

  const conversationId = req.nextUrl.searchParams.get('conversation_id')
  if (!conversationId) {
    // Return the user's recent conversations.
    const supabase = createServerSupabase()
    const { data } = await supabase
      .from('ops_assistant_conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', guard.user.id)
      .order('updated_at', { ascending: false })
      .limit(20)
    return NextResponse.json({ conversations: data ?? [] })
  }

  const supabase = createServerSupabase()
  const { data: messages } = await supabase
    .from('ops_assistant_messages')
    .select('id, role, content, tool_name, tool_input, tool_output, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  return NextResponse.json({ conversation_id: conversationId, messages: messages ?? [] })
}

export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if ('error' in guard) return guard.error

  if (!consumeRate(guard.user.id)) {
    return NextResponse.json(
      { error: `Rate limit exceeded — ${RATE_LIMIT} queries per minute.` },
      { status: 429 },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body.message !== 'string' || !body.message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const service = createServiceSupabase()
  const userClient = createServerSupabase()

  // Resolve conversation_id (create if missing).
  let conversationId: string = typeof body.conversation_id === 'string' ? body.conversation_id : ''
  if (!conversationId) {
    const { data, error } = await service
      .from('ops_assistant_conversations')
      .insert({
        user_id: guard.user.id,
        title: body.message.slice(0, 80),
        metadata: {},
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    conversationId = (data as { id: string }).id
  }

  // Load prior history for context.
  const { data: prior } = await userClient
    .from('ops_assistant_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })
    .limit(20)
  const history = ((prior ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>)
    .filter((m) => m.content)

  // Persist user message before running so it's visible mid-loop if
  // anything errors halfway.
  await service.from('ops_assistant_messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: body.message.trim(),
  })

  let result: Awaited<ReturnType<typeof runOpsAssistant>>
  try {
    result = await runOpsAssistant(service, {
      user_id: guard.user.id,
      user_message: body.message.trim(),
      history,
      callAnthropic: callAnthropicWithTools,
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'assistant failed'
    await service.from('ops_assistant_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: `Error: ${errMsg}`,
      metadata: { error: true },
    })
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }

  // Persist tool calls + final assistant message.
  for (const call of result.tool_calls) {
    await service.from('ops_assistant_messages').insert({
      conversation_id: conversationId,
      role: 'tool',
      content: '',
      tool_name: call.name,
      tool_input: call.input as Record<string, unknown>,
      tool_output: call.output as Record<string, unknown>,
    })
  }
  await service.from('ops_assistant_messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: result.text,
    metadata: {
      total_tokens: result.total_tokens ?? 0,
      tool_call_count: result.tool_calls.length,
    },
  })
  await service
    .from('ops_assistant_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  return NextResponse.json({
    conversation_id: conversationId,
    text: result.text,
    tool_calls: result.tool_calls,
  })
}
