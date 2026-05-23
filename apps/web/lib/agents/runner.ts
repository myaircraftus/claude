/**
 * Agent runner — wraps every agent invocation with audit-logging,
 * latency tracking, error capture, and a uniform recommendation
 * shape.
 *
 * Every agent call goes through `runAgent(agentId, ctx, fn)`:
 *
 *   const result = await runAgent('support.first-responder', ctx, async (logger) => {
 *     // …agent work…
 *     return { output, recommendation }
 *   })
 *
 * The runner:
 *   1. Inserts a row in agent_runs with status='running'
 *   2. Calls fn(logger) and times it
 *   3. Updates the row with status='succeeded'/'failed'/'needs_human'
 *      and the latency_ms + tokens_in/out + output + recommendation
 *
 * If the agent throws, the runner catches, marks failed, and returns
 * `{ ok: false, error }` to the caller — never re-throws. Agents
 * should be best-effort throughout the platform.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAgent } from './registry'

export interface AgentContext {
  /** Service-role Supabase client. The runner uses it to write audit rows. */
  supabase: SupabaseClient
  /** Auth user id that triggered this run, if any. */
  triggeredBy?: string | null
  /** Optional target the run is about. */
  target?: { kind: string; id: string }
  /** Free-text override of the agent's default purpose for this specific run. */
  purposeOverride?: string
  /** Input payload — recorded as-is in agent_runs.input. */
  input?: Record<string, unknown>
}

export interface AgentLogger {
  /** Record token usage if applicable. */
  recordTokens: (tokens_in: number, tokens_out: number) => void
  /** Record provider + model used. */
  recordModel: (provider: string, model: string) => void
}

export interface AgentResult<T = unknown> {
  ok: boolean
  output?: T
  recommendation?: Record<string, unknown> | null
  /** Mark the run as needing a human review even if it didn't throw. */
  needsHuman?: boolean
  error?: string
}

export async function runAgent<T>(
  agentId: string,
  ctx: AgentContext,
  fn: (logger: AgentLogger) => Promise<{
    output?: T
    recommendation?: Record<string, unknown> | null
    needsHuman?: boolean
  }>,
): Promise<AgentResult<T> & { runId?: string }> {
  const def = getAgent(agentId)
  const t0 = Date.now()
  let tokens_in = 0
  let tokens_out = 0
  let provider: string | null = null
  let model: string | null = null

  // 1. Insert pending row
  const { data: runRow, error: insertErr } = await ctx.supabase
    .from('agent_runs')
    .insert({
      agent_id: agentId,
      purpose: ctx.purposeOverride ?? def.purpose,
      trigger: def.trigger,
      triggered_by: ctx.triggeredBy ?? null,
      target_kind: ctx.target?.kind ?? null,
      target_id: ctx.target?.id ?? null,
      status: 'running',
      input: ctx.input ?? null,
    })
    .select('id')
    .single()
  const runId = (runRow as { id?: string } | null)?.id ?? undefined

  if (insertErr) {
    console.warn(`[agent.runner] insert pending row failed for ${agentId}:`, insertErr.message)
    // Continue without audit row rather than block work
  }

  const logger: AgentLogger = {
    recordTokens: (i, o) => {
      tokens_in += i
      tokens_out += o
    },
    recordModel: (p, m) => {
      provider = p
      model = m
    },
  }

  try {
    const result = await fn(logger)
    const latency = Date.now() - t0
    if (runId) {
      await ctx.supabase
        .from('agent_runs')
        .update({
          status: result.needsHuman ? 'needs_human' : 'succeeded',
          output: (result.output ?? null) as unknown as Record<string, unknown> | null,
          recommendation: result.recommendation ?? null,
          provider: provider ?? def.recommended_provider,
          model: model ?? def.recommended_model,
          latency_ms: latency,
          tokens_in,
          tokens_out,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId)
    }
    return {
      ok: true,
      runId,
      output: result.output,
      recommendation: result.recommendation,
      needsHuman: result.needsHuman,
    }
  } catch (err) {
    const latency = Date.now() - t0
    const msg = err instanceof Error ? err.message : String(err)
    if (runId) {
      await ctx.supabase
        .from('agent_runs')
        .update({
          status: 'failed',
          error_message: msg.slice(0, 2000),
          provider: provider ?? def.recommended_provider,
          model: model ?? def.recommended_model,
          latency_ms: latency,
          tokens_in,
          tokens_out,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId)
    }
    console.error(`[agent.runner] ${agentId} failed:`, msg)
    return { ok: false, runId, error: msg }
  }
}
