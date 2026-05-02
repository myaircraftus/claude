/**
 * AI Orchestration types (Spec 0.3).
 *
 * The brain has three layers:
 *
 *   Tools     — typed function calls the LLM (or rules) can invoke
 *   Signals   — events emitted by every module (meter reading, WO closed, etc.)
 *   Cards     — the orchestrator's output: ActionCards rendered on the home
 *               screen (AI Inbox).
 *
 * All shapes are kept in this single file so adding a signal type or tool
 * doesn't ripple across imports.
 */

import type { Persona } from '@/types'

/* ─── Signals ──────────────────────────────────────────────────────────── */

/**
 * The complete signal taxonomy from Spec 0.3 plus a `test` type for
 * synthetic verification (used by the acceptance harness in
 * /api/ai/signals/emit when payload.test === true). Add new types here and
 * to the orchestrator's rule registry — the DB column is open TEXT so no
 * migration is needed.
 */
export type AISignalType =
  | 'meter-reading'
  | 'wo-closed'
  | 'doc-uploaded'
  | 'compliance-due'
  | 'low-stock'
  | 'tool-overdue'
  | 'approval-response'
  | 'anomaly'
  | 'test'

export interface AISignal {
  id: string
  organization_id: string
  signal_type: AISignalType
  payload: Record<string, unknown>
  emitted_by: string | null
  source: 'user' | 'system' | 'integration' | 'cron'
  processed_at: string | null
  created_at: string
}

/** Emit-side: caller provides type + payload; the rest is filled by the API. */
export interface EmitSignalInput {
  type: AISignalType
  payload?: Record<string, unknown>
  /** Override source — defaults to 'user' if invoked by an authenticated user. */
  source?: AISignal['source']
}

/* ─── Action Cards ─────────────────────────────────────────────────────── */

export type ActionCardPriority = 'urgent' | 'high' | 'normal' | 'low'

export type ActionCardCategory =
  | 'compliance'
  | 'expiration'
  | 'maintenance'
  | 'approval'
  | 'anomaly'
  | 'insight'

export type ActionCardSource = 'rule' | 'llm' | 'ml'

/**
 * SuggestedAction — a tap-to-do button rendered on a card. The `toolCall`
 * resolves through the Tools registry so the same action can be triggered
 * by the user (clicking the button) or by the LLM (function-calling).
 */
export interface SuggestedAction {
  label: string
  toolCall: {
    tool: string
    args: Record<string, unknown>
  }
  destructive?: boolean
}

export interface ActionCard {
  id: string
  organization_id: string
  /** Persona this card targets. NULL = visible to every persona in the org. */
  persona: Persona | null
  priority: ActionCardPriority
  category: ActionCardCategory
  title: string
  body: string
  evidence: string[]
  suggested_actions: SuggestedAction[]
  confidence: number
  source: ActionCardSource
  dedupe_key: string | null
  source_signal_id: string | null
  created_at: string
  dismissed_at: string | null
  resolved_at: string | null
  acted_by: string | null
}

/** Insert-side: most fields default; only the essentials are required. */
export interface CreateActionCardInput {
  organization_id: string
  persona?: Persona | null
  priority?: ActionCardPriority
  category: ActionCardCategory
  title: string
  body: string
  evidence?: string[]
  suggested_actions?: SuggestedAction[]
  confidence?: number
  source?: ActionCardSource
  dedupe_key?: string | null
  source_signal_id?: string | null
}

/* ─── Tools ────────────────────────────────────────────────────────────── */

/**
 * AIContext — the runtime context handed to every tool handler. Keeps tools
 * decoupled from the request/response cycle: a tool can be invoked from a
 * user click, a cron tick, or the LLM, and the handler doesn't need to know
 * which.
 */
export interface AIContext {
  organization_id: string
  user_id: string
  persona: Persona
  /** Resolved org role of the invoking user — for permission checks. */
  role: string
}

export interface AITool<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string
  description: string
  /** JSON schema for args. Kept loose (object) so handlers can use Zod, AJV, etc. */
  paramsSchema: Record<string, unknown>
  /** Personas allowed to invoke this tool. Empty array = no one (disabled). */
  permissions: Persona[]
  handler: (args: TArgs, ctx: AIContext) => Promise<TResult>
}
