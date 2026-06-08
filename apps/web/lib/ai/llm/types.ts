/**
 * Shared types for the unified LLM layer (lib/ai/llm).
 *
 * This layer wraps the Vercel AI SDK so every model call across the app flows
 * through one place — uniform token/cost accounting (ai_activity_log) and
 * provider-agnostic ergonomics. See docs/vercel-ai-sdk-migration-plan.md.
 */

export type ProviderName = 'openai' | 'anthropic' | 'google'

/**
 * Normalized token usage. The AI SDK (v5+) exposes inputTokens / outputTokens
 * on the result `usage` object; we normalize to this shape so callers and the
 * ai_activity_log writer never depend on provider/SDK-version field names.
 */
export interface LlmUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/**
 * Audit-log scope — mirrors the original lib/ai/anthropic.ts ActivityLogScope so
 * existing callers and the ai_activity_log row shape stay identical.
 */
export interface ActivityLogScope {
  /** Real org id, or null for platform-level activity (substituted with the
   *  system-org sentinel at write time so the FK is always satisfied). */
  organization_id: string | null
  user_id?: string | null
  scope: string
  entity_kind?: string | null
  entity_id?: string | null
  /** Free-form context — do NOT include raw user PII. */
  context?: Record<string, unknown>
}

export type LlmActivityStatus =
  | 'success'
  | 'failure'
  | 'cap-exceeded'
  | 'rate-limited'
  | 'timeout'
