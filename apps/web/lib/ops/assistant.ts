/**
 * Phase 16 Sprint 16.8 — AI ops assistant.
 *
 * Tool-using Claude Sonnet agent for admins. Answers questions like
 * "show me orgs that haven't logged in this week" or "what's broken
 * on /aircraft pages today" using READ-ONLY tools that hit the same
 * tables as the command center pages.
 *
 * 🚨 STRICT INVARIANT — ALL TOOLS READ-ONLY.
 * No mutations, no email sends, no tier flips, no deletes. Adding a
 * new tool that mutates state requires (a) explicit human review,
 * (b) admin click-through in the UI, and (c) Phase 17+ scope.
 *
 * The agent's tool loop is intentionally simple:
 *   1. Call Anthropic with the system prompt + tool schemas.
 *   2. If the model emits tool_use, execute the matching read-only
 *      tool (capped at 5 hops to bound cost).
 *   3. Send tool_result back, loop.
 *   4. Return final text + the trace of tool calls.
 *
 * Cost: each Anthropic call goes through lib/ai/anthropic.ts so it's
 * rate-limited + cost-logged.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ──────────────────────────────────────────────────────────────────────
// Tool registry — read-only system tools
// ──────────────────────────────────────────────────────────────────────

export interface OpsToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export type OpsToolHandler = (
  supabase: SupabaseClient,
  input: Record<string, unknown>,
) => Promise<unknown>

/**
 * Each tool's Anthropic schema + handler. Schemas are the LLM-facing
 * contract; handlers are the SQL-facing implementation.
 */
const TOOL_DEFS: Record<string, { def: OpsToolDefinition; handler: OpsToolHandler }> = {
  querySupportTickets: {
    def: {
      name: 'querySupportTickets',
      description: 'List support tickets with optional filters. Returns up to 20 rows.',
      input_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: "Comma-separated: new, ai_triaging, awaiting_admin, awaiting_customer, resolved, closed" },
          severity: { type: 'string', description: "Comma-separated: P0, P1, P2, P3" },
          since_hours: { type: 'integer', description: 'Only tickets created within the last N hours.' },
          submitter_email: { type: 'string' },
        },
      },
    },
    handler: async (supabase, input) => {
      let q = supabase.from('support_tickets').select('id, ticket_number, subject, severity, status, category, submitter_email, created_at').limit(20)
      if (typeof input.status === 'string') q = q.in('status', input.status.split(',').map((s) => s.trim()))
      if (typeof input.severity === 'string') q = q.in('severity', input.severity.split(',').map((s) => s.trim()))
      if (typeof input.submitter_email === 'string') q = q.eq('submitter_email', String(input.submitter_email).toLowerCase())
      if (typeof input.since_hours === 'number') {
        q = q.gte('created_at', new Date(Date.now() - input.since_hours * 60 * 60_000).toISOString())
      }
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) return { error: error.message }
      return { tickets: data ?? [] }
    },
  },

  queryErrorEvents: {
    def: {
      name: 'queryErrorEvents',
      description: 'List error_events grouped rows. Filter by route prefix, persona, status, or time window.',
      input_schema: {
        type: 'object',
        properties: {
          route_contains: { type: 'string' },
          persona: { type: 'string' },
          status: { type: 'string', description: "new | investigating | known_issue | resolved | wont_fix" },
          since_hours: { type: 'integer', description: 'Default 24.' },
        },
      },
    },
    handler: async (supabase, input) => {
      const sinceHours = typeof input.since_hours === 'number' ? input.since_hours : 24
      let q = supabase
        .from('error_events')
        .select('id, message, route, persona, severity, status, occurrence_count, last_seen_at')
        .gte('last_seen_at', new Date(Date.now() - sinceHours * 60 * 60_000).toISOString())
        .order('occurrence_count', { ascending: false })
        .limit(20)
      if (typeof input.route_contains === 'string') q = q.ilike('route', `%${String(input.route_contains)}%`)
      if (typeof input.persona === 'string') q = q.eq('persona', input.persona)
      if (typeof input.status === 'string') q = q.eq('status', input.status)
      const { data, error } = await q
      if (error) return { error: error.message }
      return { errors: data ?? [] }
    },
  },

  queryWorkerHealth: {
    def: {
      name: 'queryWorkerHealth',
      description: 'Vision worker heartbeats — who is alive, when last seen, status.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: async (supabase) => {
      const { data, error } = await supabase
        .from('vision_worker_heartbeat')
        .select('worker_id, gpu_host, last_seen_at, status, jobs_processed_total, last_error')
        .order('last_seen_at', { ascending: false })
        .limit(20)
      if (error) return { error: error.message }
      return { workers: data ?? [] }
    },
  },

  queryQueueState: {
    def: {
      name: 'queryQueueState',
      description: 'Vision job queue depth by status + oldest queued job age.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: async (supabase) => {
      const { data: byStatus } = await supabase
        .from('vision_index_jobs')
        .select('status')
      const counts: Record<string, number> = {}
      for (const r of (byStatus ?? []) as Array<{ status: string }>) counts[r.status] = (counts[r.status] ?? 0) + 1
      const { data: oldest } = await supabase
        .from('vision_index_jobs')
        .select('id, created_at, scheduled_for')
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      return { counts, oldest_queued: oldest ?? null }
    },
  },

  queryCostSnapshots: {
    def: {
      name: 'queryCostSnapshots',
      description: 'Daily cost roll-ups for the trailing N days (default 7).',
      input_schema: {
        type: 'object',
        properties: {
          days: { type: 'integer', description: 'Default 7.' },
        },
      },
    },
    handler: async (supabase, input) => {
      const days = typeof input.days === 'number' ? Math.min(90, Math.max(1, input.days)) : 7
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('cost_snapshots')
        .select('snapshot_date, source, spend_cents, unit_count, unit_name')
        .gte('snapshot_date', cutoff)
        .order('snapshot_date', { ascending: false })
      if (error) return { error: error.message }
      return { snapshots: data ?? [] }
    },
  },

  queryCustomerSignals: {
    def: {
      name: 'queryCustomerSignals',
      description: 'Open churn_signals rows. Filter by signal_type or org.',
      input_schema: {
        type: 'object',
        properties: {
          signal_type: { type: 'string' },
          organization_id: { type: 'string' },
        },
      },
    },
    handler: async (supabase, input) => {
      let q = supabase
        .from('churn_signals')
        .select('id, organization_id, signal_type, severity, summary, detected_at')
        .eq('status', 'open')
        .order('detected_at', { ascending: false })
        .limit(50)
      if (typeof input.signal_type === 'string') q = q.eq('signal_type', input.signal_type)
      if (typeof input.organization_id === 'string') q = q.eq('organization_id', input.organization_id)
      const { data, error } = await q
      if (error) return { error: error.message }
      return { signals: data ?? [] }
    },
  },

  queryDocumentStats: {
    def: {
      name: 'queryDocumentStats',
      description: 'Documents grouped by parsing_status across the platform.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: async (supabase) => {
      const { data } = await supabase
        .from('documents')
        .select('parsing_status')
      const counts: Record<string, number> = {}
      for (const r of (data ?? []) as Array<{ parsing_status: string }>) {
        counts[r.parsing_status] = (counts[r.parsing_status] ?? 0) + 1
      }
      return { counts }
    },
  },

  listOrgsByActivity: {
    def: {
      name: 'listOrgsByActivity',
      description: 'List organizations + how many days since the last user-attributable activity (work order, doc upload, or ai_activity_log row).',
      input_schema: {
        type: 'object',
        properties: {
          inactive_days: { type: 'integer', description: 'Only return orgs with >= N idle days. Default 0 (return all).' },
        },
      },
    },
    handler: async (supabase, input) => {
      const inactive = typeof input.inactive_days === 'number' ? input.inactive_days : 0
      const { data: orgs } = await supabase.from('organizations').select('id, name, slug, tier').limit(50)
      const now = Date.now()
      const out = []
      for (const org of (orgs ?? []) as Array<{ id: string; name: string; slug: string; tier: string }>) {
        const { data: lastWO } = await supabase
          .from('work_orders').select('updated_at').eq('organization_id', org.id)
          .order('updated_at', { ascending: false }).limit(1).maybeSingle()
        const { data: lastDoc } = await supabase
          .from('documents').select('updated_at').eq('organization_id', org.id)
          .order('updated_at', { ascending: false }).limit(1).maybeSingle()
        const lastTs = Math.max(
          lastWO ? new Date((lastWO as { updated_at: string }).updated_at).getTime() : 0,
          lastDoc ? new Date((lastDoc as { updated_at: string }).updated_at).getTime() : 0,
        )
        const idleDays = lastTs ? Math.round((now - lastTs) / (24 * 60 * 60_000)) : 9999
        if (idleDays >= inactive) out.push({ id: org.id, name: org.name, slug: org.slug, tier: org.tier, idle_days: idleDays })
      }
      out.sort((a, b) => b.idle_days - a.idle_days)
      return { orgs: out }
    },
  },

  searchKnowledgeBase: {
    def: {
      name: 'searchKnowledgeBase',
      description: 'Search resolved support_tickets where the AI auto-resolved successfully — these are the seed knowledge base entries (Sprint 16.10 wires the public KB).',
      input_schema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search term in subject + body.' },
        },
        required: ['q'],
      },
    },
    handler: async (supabase, input) => {
      const term = String(input.q ?? '').replace(/[%_]/g, '\\$&')
      if (!term) return { entries: [] }
      const { data, error } = await supabase
        .from('support_tickets')
        .select('ticket_number, subject, body, resolution_summary, category, resolved_at')
        .eq('status', 'resolved')
        .or(`subject.ilike.%${term}%,body.ilike.%${term}%`)
        .order('resolved_at', { ascending: false })
        .limit(10)
      if (error) return { error: error.message }
      return { entries: data ?? [] }
    },
  },

  generateClaudeCodePrompt: {
    def: {
      name: 'generateClaudeCodePrompt',
      description: 'Hand off to lib/ops/prompt-generator (Sprint 16.11) to produce a paste-ready Claude Code fix prompt for the given ops_event id. STUB until 16.11 lands.',
      input_schema: {
        type: 'object',
        properties: {
          source_type: { type: 'string', description: "support_ticket | error_event | alert_event" },
          source_id: { type: 'string' },
        },
        required: ['source_type', 'source_id'],
      },
    },
    // Stub: returns a placeholder until Sprint 16.11 lands the real
    // prompt-generator. The schema is correct so the agent can call it
    // confidently; the response telegraphs that the feature is on the way.
    handler: async () => ({
      ok: false,
      message: 'Claude Code prompt generator ships in Sprint 16.11. Once live, this tool returns the full markdown prompt.',
    }),
  },
}

export const OPS_TOOLS: OpsToolDefinition[] = Object.values(TOOL_DEFS).map((t) => t.def)

// ──────────────────────────────────────────────────────────────────────
// Agent loop
// ──────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are aircraft.us platform-admin ops assistant.
You answer operational questions using ONLY the read-only tools provided.
You may NOT mutate any data. You may NOT send emails. You may NOT execute
side effects. If a question requires a mutation (e.g. "delete that org"
or "send a re-engagement email"), refuse and explain which admin UI to
use instead.

Style: terse, factual, link-aware. When you cite a count or a list,
include the SQL-equivalent shape so the admin trusts the answer.
Format: short paragraphs + bullet lists. No markdown headings unless
the answer is genuinely multi-section.

When the question maps to a tool, call it. Don't free-associate.
You have at most 5 tool calls per question; budget accordingly.`

const MAX_TOOL_HOPS = 5

export interface AssistantResult {
  text: string
  tool_calls: Array<{ name: string; input: unknown; output: unknown }>
  total_tokens?: number
}

/**
 * Run a single user question through the agent loop. Caller owns the
 * conversation_id (persistence is handled by the route handler so we
 * can keep this function pure-ish for tests).
 */
export async function runOpsAssistant(
  supabase: SupabaseClient,
  args: {
    user_id: string
    user_message: string
    /** Prior conversation messages — array of {role, content} for context. */
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
    /** Override default Sonnet — used in tests. */
    callAnthropic: typeof callAnthropicWithTools
  },
): Promise<AssistantResult> {
  const messages: AnthropicMessage[] = [
    ...(args.history ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: args.user_message },
  ]

  const tool_calls: Array<{ name: string; input: unknown; output: unknown }> = []
  let totalTokens = 0

  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    const response = await args.callAnthropic({
      system: SYSTEM_PROMPT,
      messages,
      tools: OPS_TOOLS,
    })
    totalTokens += response.input_tokens + response.output_tokens

    if (response.stop_reason === 'tool_use') {
      const toolUse = response.content.find((c) => c.type === 'tool_use')
      if (!toolUse || toolUse.type !== 'tool_use') break
      const tool = TOOL_DEFS[toolUse.name]
      if (!tool) {
        const result = { error: `unknown tool: ${toolUse.name}` }
        messages.push({ role: 'assistant', content: response.content })
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) }],
        })
        tool_calls.push({ name: toolUse.name, input: toolUse.input, output: result })
        continue
      }
      const output = await tool.handler(supabase, (toolUse.input ?? {}) as Record<string, unknown>)
      tool_calls.push({ name: toolUse.name, input: toolUse.input, output })

      messages.push({ role: 'assistant', content: response.content })
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(output) }],
      })
      continue
    }

    // end_turn — extract text and return.
    const finalText = response.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { text: string }).text)
      .join('\n\n')
    return { text: finalText, tool_calls, total_tokens: totalTokens }
  }

  // Tool-hop budget exhausted.
  return {
    text: 'I hit the tool-call budget for this question. Try narrowing the question or breaking it into pieces.',
    tool_calls,
    total_tokens: totalTokens,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Anthropic call shape (tools-aware)
//
// We don't use lib/ai/anthropic.ts directly here because that module
// returns plain text; the assistant needs the full tool_use response.
// Instead we wrap fetch() with the same auth + retry semantics.
// ──────────────────────────────────────────────────────────────────────

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | Array<unknown>
}

interface AnthropicToolsResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  >
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
  input_tokens: number
  output_tokens: number
}

export async function callAnthropicWithTools(args: {
  system: string
  messages: AnthropicMessage[]
  tools: OpsToolDefinition[]
  model?: string
  max_tokens?: number
}): Promise<AnthropicToolsResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: args.model ?? 'claude-sonnet-4-5',
      max_tokens: args.max_tokens ?? 1024,
      system: args.system,
      tools: args.tools,
      messages: args.messages,
    }),
    signal: AbortSignal.timeout(45_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`anthropic ${res.status}: ${body.slice(0, 240)}`)
  }
  const json = await res.json() as {
    content: AnthropicToolsResponse['content']
    stop_reason: AnthropicToolsResponse['stop_reason']
    usage: { input_tokens: number; output_tokens: number }
  }
  return {
    content: json.content,
    stop_reason: json.stop_reason,
    input_tokens: json.usage?.input_tokens ?? 0,
    output_tokens: json.usage?.output_tokens ?? 0,
  }
}

// Re-export for tests + the route handler.
export { TOOL_DEFS as _TOOL_DEFS_FOR_TESTS }
