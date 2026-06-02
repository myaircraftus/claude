/**
 * Ask AI thread persistence.
 *
 * Backed by dedicated, self-contained tables — `ask_threads` +
 * `ask_thread_messages` (migration 20260602000000_ask_ai_threads.sql) — so the
 * feature does NOT depend on the work-order chat schema (conversation_threads /
 * thread_messages), which is not reliably present across environments and whose
 * messages table lacks a `created_by` column. RLS scopes every row to its owner
 * (`user_id = auth.uid()`), so a user only ever sees their own conversations.
 *
 * All writes are best-effort: a persistence failure degrades the Ask agent to a
 * stateless single-shot answer rather than blocking the user's reply.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const HISTORY_TURN_LIMIT = 10
const HISTORY_CONTENT_CAP = 2000

export interface AskThreadSummary {
  id: string
  title: string
  aircraft_id: string | null
  persona: string | null
  created_at: string
  updated_at: string
}

export interface AskThreadMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface ResolvedAskThread {
  threadId: string
  aircraftId: string | null
  isNew: boolean
}

/**
 * Resolve the conversation thread for an Ask AI turn: reuse an existing
 * (owned) thread or create a new one. Keeps the thread's `aircraft_id` in sync
 * with the latest explicit scope selection. Returns null on failure so the
 * caller can degrade to a stateless answer.
 */
export async function resolveAskThread(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    userId: string
    threadId?: string | null
    firstMessage: string
    aircraftId: string | null
    persona: string
  },
): Promise<ResolvedAskThread | null> {
  const { organizationId, userId, threadId, firstMessage, aircraftId, persona } = args

  if (threadId) {
    const { data: existing } = await supabase
      .from('ask_threads')
      .select('id, aircraft_id')
      .eq('id', threadId)
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      // Keep the thread's scope in sync with the latest explicit selection.
      if (((existing as { aircraft_id: string | null }).aircraft_id ?? null) !== aircraftId) {
        await supabase
          .from('ask_threads')
          .update({ aircraft_id: aircraftId, updated_at: new Date().toISOString() })
          .eq('id', threadId)
          .eq('user_id', userId)
      }
      return { threadId: (existing as { id: string }).id, aircraftId, isNew: false }
    }
    // threadId supplied but not found/owned — fall through and create a fresh one.
  }

  const title = firstMessage.replace(/\s+/g, ' ').trim().slice(0, 80) || 'New conversation'
  const { data: created, error } = await supabase
    .from('ask_threads')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      title,
      aircraft_id: aircraftId,
      persona,
    })
    .select('id')
    .single()

  if (error || !created) {
    console.warn('[ask.threads] failed to create thread:', error?.message)
    return null
  }
  return { threadId: (created as { id: string }).id, aircraftId, isNew: true }
}

/** Prior user/assistant turns for this thread, oldest→newest, sanitized for the LLM. */
export async function loadAskHistory(
  supabase: SupabaseClient,
  threadId: string,
  organizationId: string,
  limit = HISTORY_TURN_LIMIT,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const { data } = await supabase
    .from('ask_thread_messages')
    .select('role, content, created_at')
    .eq('thread_id', threadId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  const rows = (data ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>
  return rows
    .reverse()
    .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content.slice(0, HISTORY_CONTENT_CAP) }))
}

export async function appendAskMessage(
  supabase: SupabaseClient,
  args: {
    threadId: string
    organizationId: string
    userId: string
    role: 'user' | 'assistant'
    content: string
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await supabase.from('ask_thread_messages').insert({
    thread_id: args.threadId,
    organization_id: args.organizationId,
    role: args.role,
    content: args.content ?? '',
    metadata: { user_id: args.userId, ...(args.metadata ?? {}) },
  })
  if (error) console.warn('[ask.threads] failed to persist message:', error.message)
}

export async function touchAskThread(
  supabase: SupabaseClient,
  threadId: string,
  organizationId: string,
): Promise<void> {
  await supabase
    .from('ask_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('organization_id', organizationId)
}

/** The user's Ask AI conversations, most-recently-updated first. */
export async function listAskThreads(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
  limit = 30,
): Promise<AskThreadSummary[]> {
  const { data } = await supabase
    .from('ask_threads')
    .select('id, title, aircraft_id, persona, created_at, updated_at')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('archived', false)
    .order('updated_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as Array<Record<string, any>>).map((r) => ({
    id: r.id as string,
    title: (r.title as string) ?? 'Conversation',
    aircraft_id: (r.aircraft_id as string | null) ?? null,
    persona: (r.persona as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }))
}

/** Full message history for one owned thread (for UI rehydration). */
export async function loadAskThreadMessages(
  supabase: SupabaseClient,
  threadId: string,
  organizationId: string,
  userId: string,
): Promise<{ thread: AskThreadSummary; messages: AskThreadMessage[] } | null> {
  const { data: thread } = await supabase
    .from('ask_threads')
    .select('id, title, aircraft_id, persona, created_at, updated_at')
    .eq('id', threadId)
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!thread) return null

  const { data: msgs } = await supabase
    .from('ask_thread_messages')
    .select('id, role, content, metadata, created_at')
    .eq('thread_id', threadId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })

  const messages = ((msgs ?? []) as Array<Record<string, any>>).map((m) => ({
    id: m.id as string,
    role: m.role as 'user' | 'assistant',
    content: (m.content as string) ?? '',
    metadata: (m.metadata as Record<string, unknown>) ?? {},
    created_at: m.created_at as string,
  }))

  const t = thread as Record<string, any>
  return {
    thread: {
      id: t.id as string,
      title: (t.title as string) ?? 'Conversation',
      aircraft_id: (t.aircraft_id as string | null) ?? null,
      persona: (t.persona as string | null) ?? null,
      created_at: t.created_at as string,
      updated_at: t.updated_at as string,
    },
    messages,
  }
}

/**
 * Soft-delete a conversation (archive). Reversible, and avoids a hard delete —
 * the list query filters `archived = false`.
 */
export async function archiveAskThread(
  supabase: SupabaseClient,
  threadId: string,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('ask_threads')
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('organization_id', organizationId)
    .eq('user_id', userId)

  if (error) {
    console.warn('[ask.threads] archive failed:', error.message)
    return false
  }
  return true
}
