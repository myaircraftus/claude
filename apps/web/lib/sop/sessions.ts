/**
 * sop/sessions — server-side persistence for SOP Simulator chats.
 *
 * The simulator at /sop-library/simulator runs a multi-turn chat where
 * the AI plays a coach guiding the user through a real workflow. This
 * module persists those conversations so:
 *   1. Users can resume after closing the tab
 *   2. Compliance can audit who completed which training scenario
 *   3. Aggregate metrics ("we ran 247 annual-inspection trainings this
 *      quarter") are queryable
 *
 * The table is sop_simulator_sessions (migration 20260521000000).
 *
 * All functions are graceful — if persistence fails (e.g., the user
 * isn't yet authenticated to Supabase but is authenticated to the
 * platform), they return null instead of throwing. The simulator UX
 * must still work even if the DB write fails — training takes
 * precedence over audit logging.
 */
import { createServerSupabase } from '@/lib/supabase/server'

export interface SimChatTurn {
  role: 'user' | 'assistant'
  content: string
  ts?: number
}

export interface SimSession {
  id: string
  scenario_id: string
  messages: SimChatTurn[]
  completed_criteria: string[]
  is_complete: boolean
  started_at: string
  last_message_at: string
  completed_at: string | null
  organization_id: string | null
}

/**
 * Insert a new session row. Returns the new session id, or null if the
 * insert fails (e.g., DB unavailable, user not yet a known auth.user).
 */
export async function createSession(args: {
  userId: string
  scenarioId: string
  openingMessage: string
  organizationId?: string | null
}): Promise<string | null> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('sop_simulator_sessions')
      .insert({
        user_id: args.userId,
        scenario_id: args.scenarioId,
        messages: [
          { role: 'assistant', content: args.openingMessage, ts: Date.now() },
        ],
        organization_id: args.organizationId ?? null,
      })
      .select('id')
      .single()
    if (error || !data) {
      console.warn('[sop/sessions] createSession failed:', error?.message)
      return null
    }
    return data.id as string
  } catch (err) {
    console.warn('[sop/sessions] createSession threw:', err)
    return null
  }
}

/**
 * Append a (user turn, assistant turn) pair to an existing session
 * and update completion state. The DB writes are best-effort — if
 * they fail we still let the chat keep going.
 */
export async function appendTurn(args: {
  sessionId: string
  userId: string
  userTurn: SimChatTurn
  assistantTurn: SimChatTurn
  completedCriteria: string[]
  scenarioComplete: boolean
}): Promise<void> {
  try {
    const supabase = createServerSupabase()
    // Read existing messages so we can append without race-y JSONB ops.
    const { data: row, error } = await supabase
      .from('sop_simulator_sessions')
      .select('messages, is_complete, completed_at')
      .eq('id', args.sessionId)
      .eq('user_id', args.userId)
      .maybeSingle()
    if (error || !row) {
      console.warn('[sop/sessions] appendTurn lookup failed:', error?.message)
      return
    }
    const existing = Array.isArray(row.messages) ? (row.messages as SimChatTurn[]) : []
    const nextMessages = [...existing, args.userTurn, args.assistantTurn]
    const update: Record<string, unknown> = {
      messages: nextMessages,
      last_message_at: new Date().toISOString(),
      completed_criteria: args.completedCriteria,
    }
    if (args.scenarioComplete && !row.is_complete) {
      update.is_complete = true
      update.completed_at = new Date().toISOString()
    }
    const { error: upErr } = await supabase
      .from('sop_simulator_sessions')
      .update(update)
      .eq('id', args.sessionId)
      .eq('user_id', args.userId)
    if (upErr) {
      console.warn('[sop/sessions] appendTurn update failed:', upErr.message)
    }
  } catch (err) {
    console.warn('[sop/sessions] appendTurn threw:', err)
  }
}

/**
 * List the current user's prior simulator sessions, newest first.
 * Used by the resume picker.
 */
export async function listSessions(userId: string, limit = 50): Promise<SimSession[]> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('sop_simulator_sessions')
      .select(
        'id, scenario_id, messages, completed_criteria, is_complete, started_at, last_message_at, completed_at, organization_id',
      )
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit)
    if (error || !data) {
      return []
    }
    return data as unknown as SimSession[]
  } catch (err) {
    console.warn('[sop/sessions] listSessions threw:', err)
    return []
  }
}

/**
 * Fetch a specific session by id, scoped to the requesting user via RLS.
 */
export async function getSession(args: {
  sessionId: string
  userId: string
}): Promise<SimSession | null> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('sop_simulator_sessions')
      .select(
        'id, scenario_id, messages, completed_criteria, is_complete, started_at, last_message_at, completed_at, organization_id',
      )
      .eq('id', args.sessionId)
      .eq('user_id', args.userId)
      .maybeSingle()
    if (error || !data) return null
    return data as unknown as SimSession
  } catch (err) {
    console.warn('[sop/sessions] getSession threw:', err)
    return null
  }
}
