/**
 * POST /api/ask
 *
 * AI Command Center endpoint. Wraps GPT-4o with tool calling so the AI can:
 *   - Search documents (RAG, via /api/query internally)
 *   - Search logbook entries
 *   - Search parts
 *   - Draft a logbook entry
 *   - Generate a checklist
 *
 * Falls back to pure RAG for simple Q&A (when no tools are called).
 *
 * Request body:
 *   { question: string, aircraft_id?: string, persona?: 'owner' | 'mechanic', conversation_history?: ConversationTurn[] }
 *
 * Response:
 *   { answer: string, artifacts?: Artifact[], citations?: ..., tool_calls_made?: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabase } from '@/lib/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { AI_TOOLS, type AiToolName } from '@/lib/ai/tools'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { classifyAskQuestion } from '@/lib/ask/question-classifier'
import { tryFleetAggregation } from '@/lib/ask/fleet-aggregation'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Artifact {
  type: 'logbook_draft' | 'checklist' | 'parts_results' | 'logbook_entries'
  title: string
  data: unknown
  aircraft_id?: string
  /** Deeplink for "Use This" CTA */
  action_url?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Forward a request to an internal API route, reusing the caller's cookies. */
async function callInternal(
  req: NextRequest,
  path: string,
  body: unknown
): Promise<unknown> {
  const url = new URL(path, req.url)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') || '',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return { error: `${path} returned ${res.status}`, detail: errText.slice(0, 200) }
  }
  return res.json().catch(() => ({ error: `${path} returned non-JSON` }))
}

/** GET variant for logbook search */
async function callInternalGet(
  req: NextRequest,
  path: string,
  params: Record<string, string>
): Promise<unknown> {
  const url = new URL(path, req.url)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: { cookie: req.headers.get('cookie') || '' },
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return { error: `${path} returned ${res.status}`, detail: errText.slice(0, 200) }
  }
  return res.json().catch(() => ({ error: `${path} returned non-JSON` }))
}

// ── Tool dispatcher ────────────────────────────────────────────────────────────

async function dispatchTool(
  req: NextRequest,
  name: string,
  args: Record<string, unknown>
): Promise<{ result: unknown; artifact?: Artifact; citations?: any[]; followUps?: string[]; confidence?: string }> {
  switch (name) {
    case 'create_logbook_entry': {
      const data = await callInternal(req, '/api/ai/generate-logbook', {
        aircraft_id: args.aircraft_id,
        squawk_description: args.description,
        entry_type: args.entry_type,
      })
      const artifact: Artifact = {
        type: 'logbook_draft',
        title: 'Logbook Entry Draft',
        data,
        aircraft_id: args.aircraft_id as string | undefined,
        action_url: `/maintenance/new?aircraft_id=${args.aircraft_id ?? ''}`,
      }
      return { result: data, artifact }
    }

    case 'search_parts': {
      const data = await callInternal(req, '/api/parts/search', {
        query: args.query,
        aircraft_id: args.aircraft_id,
        limit: 8,
      }) as any
      const artifact: Artifact = {
        type: 'parts_results',
        title: `Parts: "${args.query}"`,
        data,
        aircraft_id: args.aircraft_id as string | undefined,
        action_url: `/parts/library?q=${encodeURIComponent(String(args.query))}${args.aircraft_id ? `&aircraft_id=${args.aircraft_id}` : ''}`,
      }
      return { result: data, artifact }
    }

    case 'search_logbook': {
      const params: Record<string, string> = {}
      if (args.aircraft_id) params.aircraft_id = String(args.aircraft_id)

      // Normalize the AI's free-form query so substrings like "latest 100-hour"
      // actually match real entries (which read "100 Hour Inspection ...").
      // - drop timeline qualifiers ("latest", "most recent", "find", etc.)
      // - normalize hyphens to spaces ("100-hour" → "100 hour")
      // - tokenize so we can match on terms, not the literal phrase
      const rawQuery = String(args.query ?? '')
      const QUALIFIERS = /\b(?:latest|last|most|recent|find|show|me|please|the|a|an|of|on|for|inspection|inspections|entry|entries|aircraft)\b/g
      const normalized = rawQuery
        .toLowerCase()
        .replace(/-/g, ' ')
        .replace(QUALIFIERS, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      const terms = normalized.split(' ').filter((t) => t.length >= 2)

      // Push the strongest single term to the API for DB-side ILIKE (uses
      // existing index). Falls through to client-side AND-of-terms below.
      const primaryTerm = terms.find((t) => /\d/.test(t)) ?? terms[0]
      if (primaryTerm) params.search = primaryTerm

      const data = await callInternalGet(req, '/api/logbook-entries', params) as any
      const entries = Array.isArray(data?.entries) ? data.entries : []

      // The API aliases `description` → `entry_text`. Filter on the actual
      // returned shape and require all terms to appear (AND semantics).
      const filtered = terms.length > 0
        ? entries.filter((e: any) => {
            const haystack = `${e.entry_text ?? e.description ?? ''} ${e.entry_type ?? ''} ${e.logbook_type ?? ''}`.toLowerCase()
            return terms.every((t) => haystack.includes(t))
          })
        : entries

      // Entries already come back ordered by entry_date DESC; take the top 10
      // so "latest" queries naturally surface the most recent matches first.
      const limited = filtered.slice(0, 10)

      const artifact: Artifact = {
        type: 'logbook_entries',
        title: rawQuery ? `Logbook: "${rawQuery}"` : 'Logbook entries',
        data: { entries: limited },
        aircraft_id: args.aircraft_id as string | undefined,
        // Send users to the aircraft detail page (where the logbook lives),
        // not /maintenance which is dominated by work orders.
        action_url: args.aircraft_id
          ? `/aircraft/${args.aircraft_id}`
          : '/aircraft',
      }
      return { result: { entries: limited }, artifact }
    }

    case 'search_documents': {
      // Use the existing RAG pipeline via /api/query which enriches citations
      // with textAnchorStart/End + boundingRegions so the UI can highlight the
      // exact source span.
      const data = await callInternal(req, '/api/query', {
        question: args.query,
        aircraft_id: args.aircraft_id,
        conversation_history: [],
      }) as any
      return { result: data, citations: data?.citations ?? [], followUps: data?.follow_up_questions ?? [], confidence: data?.confidence }
    }

    case 'generate_checklist': {
      const data = await callInternal(req, '/api/ai/generate-checklist', {
        aircraft_id: args.aircraft_id,
        scope: args.scope,
        reference: args.reference,
        prompt: args.prompt,
      })
      const artifact: Artifact = {
        type: 'checklist',
        title: `Checklist: ${args.scope}${args.reference ? ` — ${args.reference}` : ''}`,
        data,
        aircraft_id: args.aircraft_id as string | undefined,
        action_url: `/maintenance/new?checklist=${encodeURIComponent(String(args.scope))}${args.aircraft_id ? `&aircraft_id=${args.aircraft_id}` : ''}`,
      }
      return { result: data, artifact }
    }

    default:
      return { result: { error: `Unknown tool: ${name}` } }
  }
}

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the AI Command Center for myaircraft.us — an intelligent aviation assistant for aircraft owners and A&P mechanics.

You have access to tools that let you take real actions:
- search_documents: semantic search over the user's uploaded aircraft documents (logbooks, POH, manuals, ADs, SBs)
- search_logbook: find past logbook entries
- search_parts: find parts in the catalog
- create_logbook_entry: draft a FAA-compliant logbook entry
- generate_checklist: produce an inspection or compliance checklist

BEHAVIOR RULES:
1. When the user asks a question answerable from their documents, call search_documents.
2. When the user wants to create/draft a logbook entry, call create_logbook_entry.
3. When the user asks about parts, call search_parts.
4. When the user wants a checklist, call generate_checklist.
5. When looking up maintenance history, call search_logbook.
6. You may call multiple tools in sequence when needed.
7. After tools return results, synthesize a concise, helpful response. Do not just dump raw JSON.
8. For safety-critical items (ADs, limits, emergency procedures), always note the user should verify with the actual document and a qualified aviation professional.

SCOPE:
You ONLY answer questions about THIS user's aircraft, their maintenance records and documents, and aviation maintenance in general. For clearly off-topic or general-knowledge questions (geography, trivia, news, celebrities, math, coding, anything unrelated to aircraft maintenance), do NOT answer from general knowledge — briefly decline in one sentence and steer the user back to their aircraft records.`

// Phase 18 mig 119 — mechanic merged into shop. The /api/ask route now
// branches on 'owner' vs 'shop'; legacy 'mechanic' inputs are coerced to
// 'shop' at the request boundary.
type AskPersona = 'owner' | 'shop'

async function resolveCanonicalAircraftId(
  supabase: ReturnType<typeof createServerSupabase>,
  organizationId: string,
  aircraftId?: string
) {
  if (!aircraftId) return undefined

  const { data: currentAircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('id', aircraftId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!currentAircraft?.tail_number) {
    return aircraftId
  }

  const { data: siblingAircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('organization_id', organizationId)
    .eq('tail_number', currentAircraft.tail_number)
    .eq('is_archived', false)

  if (!Array.isArray(siblingAircraft) || siblingAircraft.length <= 1) {
    return aircraftId
  }

  const siblingIds = siblingAircraft.map((row) => row.id)
  const { data: docs } = await supabase
    .from('documents')
    .select('aircraft_id')
    .in('aircraft_id', siblingIds)
    .neq('parsing_status', 'failed')

  const counts = new Map<string, number>()
  for (const row of docs ?? []) {
    const id = typeof row.aircraft_id === 'string' ? row.aircraft_id : null
    if (!id) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  const canonical = siblingAircraft.reduce((best, candidate) => {
    const bestCount = counts.get(best.id) ?? 0
    const candidateCount = counts.get(candidate.id) ?? 0
    if (candidateCount > bestCount) return candidate
    if (candidateCount === bestCount && candidate.id === aircraftId) return candidate
    return best
  })

  return canonical.id
}

// Owner mode = "find me this in the book" experience. The user asks a
// question about their uploaded logbook PDFs (and other docs), the AI answers
// with [N] citations, and clicking a citation opens the cited page in the
// side-panel preview where the user can read, download, or share it. We
// intentionally drop search_logbook here — that tool returns structured DB
// rows on a separate detail page, which broke the "find a passage in the
// book" mental model. Mechanic mode still has both because mechanics use
// search_logbook to find templates for drafting new entries.
const OWNER_TOOL_NAMES: readonly AiToolName[] = [
  'search_documents',
]

const MECHANIC_TOOL_NAMES: readonly AiToolName[] = [
  'create_logbook_entry',
  'search_parts',
  'search_logbook',
  'search_documents',
  'generate_checklist',
]

const MECHANIC_ELIGIBLE_ROLES = new Set(['owner', 'admin', 'mechanic'])

function buildSystemPrompt(persona: AskPersona) {
  if (persona === 'shop') {
    return `${SYSTEM_PROMPT}

CURRENT PERSONA: mechanic

Mechanic mode is action-oriented. You may use maintenance workflow tools like create_logbook_entry, search_parts, and generate_checklist when they materially help the user. Prefer concrete maintenance outputs over generic advice when appropriate.`
  }

  return `${SYSTEM_PROMPT}

CURRENT PERSONA: owner

Owner mode is "find me this in the book" — like searching a paper logbook.
- ALWAYS call search_documents for any question about records, inspections, history, or compliance. The user's question is almost always answerable by finding the relevant passage in their uploaded logbook / POH / maintenance manual PDFs.
- For "find me the latest X" or "show me all X", call search_documents and cite EVERY matching passage with [N] markers — the user wants to scan the matches and click into the source PDF to read in context.
- Each [N] in your answer must correspond to a real document chunk you cited. The UI renders these as clickable links that open the cited page of the source PDF in a side panel for download and review.
- Do not draft maintenance entries, checklists, or mechanic workflow actions in owner mode. If the user asks for one, briefly explain they should switch to mechanic mode.`
}

function toolsForPersona(persona: AskPersona): OpenAI.Chat.ChatCompletionTool[] {
  const allowed = new Set(persona === 'shop' ? MECHANIC_TOOL_NAMES : OWNER_TOOL_NAMES)
  return AI_TOOLS.filter((tool) => allowed.has(tool.function.name as AiToolName)) as OpenAI.Chat.ChatCompletionTool[]
}

// ── Agent runner ─────────────────────────────────────────────────────────────────

/** Assembled output of one /api/ask agent run — the data the POST handler serializes. */
interface AskAgentResult {
  answer: string
  artifacts: Artifact[]
  citations: any[]
  /** RAG confidence: 'high' | 'medium' | 'low' | 'insufficient_evidence' | undefined. */
  confidence: string | undefined
  followUps: string[]
  toolCalls: string[]
}

/**
 * Run one GPT-4o tool-calling agent pass (max 3 rounds) and return the
 * assembled artifacts / citations / confidence / follow-ups / tool calls.
 *
 * This is the SINGLE source of truth for the agent loop. The POST handler
 * calls it once for a single-aircraft (or single org-wide) request, and once
 * per aircraft when fanning out across "All Aircraft". Behavior for a single
 * call is byte-identical to the pre-refactor inline loop.
 *
 * `aircraftId` is the already-resolved canonical aircraft id (or undefined for
 * an org-wide pass). This helper never resolves canonical ids itself.
 */
async function runAskAgent(
  req: NextRequest,
  openai: OpenAI,
  opts: {
    question: string
    persona: AskPersona
    aircraftId?: string
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  },
): Promise<AskAgentResult> {
  const { question, persona, aircraftId, conversationHistory } = opts
  const personaTools = toolsForPersona(persona)

  // Build initial messages
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(persona) },
    ...conversationHistory.map(
      (m) => ({ role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam),
    ),
    {
      role: 'user',
      content: aircraftId
        ? `[Context: aircraft_id=${aircraftId}]\n\n${question}`
        : question,
    },
  ]

  const artifacts: Artifact[] = []
  const toolCallsMade: string[] = []
  // Citations collected from any search_documents tool calls so the UI can
  // render "click citation → highlight source" for the user's demo flow.
  const collectedCitations: any[] = []
  const collectedFollowUps: string[] = []
  let ragConfidence: string | undefined

  // ── Tool-calling loop (max 3 rounds) ───────────────────────────────────────
  let round = 0
  while (round < 3) {
    round++

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
      temperature: 0.3,
      max_tokens: 1500,
      tools: personaTools,
      tool_choice: 'auto',
      messages,
    })

    const choice = response.choices[0]
    const msg = choice.message

    // Add assistant message to history
    messages.push(msg as OpenAI.Chat.ChatCompletionMessageParam)

    // If no tool calls → final answer
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return {
        answer: msg.content ?? '',
        artifacts,
        // Confidence reflects RAG evidence only — never hard-code 'high' just
        // because a non-RAG tool produced an artifact (audit fix: an artifact
        // is not evidence of answer accuracy).
        confidence: ragConfidence,
        citations: collectedCitations,
        followUps: collectedFollowUps,
        toolCalls: toolCallsMade,
      }
    }

    // Dispatch each tool call
    const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = []
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function.arguments) } catch { /* ignore */ }

      // Inject aircraft_id from context if not provided
      if (!args.aircraft_id && aircraftId) {
        args.aircraft_id = aircraftId
      }

      toolCallsMade.push(tc.function.name)
      const { result, artifact, citations: newCites, followUps, confidence } = await dispatchTool(req, tc.function.name, args)
      if (artifact) artifacts.push(artifact)
      if (newCites && newCites.length > 0) collectedCitations.push(...newCites)
      if (followUps && followUps.length > 0) collectedFollowUps.push(...followUps)
      if (confidence) ragConfidence = confidence

      toolResults.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      })
    }

    // Add tool results to messages and loop
    messages.push(...toolResults)
  }

  // Exhausted rounds — return what we have.
  return {
    answer: 'I gathered some results for you. See the cards below.',
    artifacts,
    confidence: ragConfidence,
    citations: collectedCitations,
    followUps: collectedFollowUps,
    toolCalls: toolCallsMade,
  }
}

// ── Fan-out helpers ──────────────────────────────────────────────────────────────

/**
 * One aircraft's section in a fanned-out "All Aircraft" answer. `answer` carries
 * GLOBALLY-renumbered `[N]` markers so they resolve against the merged
 * `citations` array. `has_data` is false for failed / insufficient / empty
 * aircraft (their `answer` is the short "No records found." style line).
 */
export interface PerAircraftAnswer {
  tail: string
  answer: string
  has_data: boolean
}

/** Confidence ranking for the mixed-confidence "minimum wins" rule. */
const CONFIDENCE_RANK: Record<string, number> = {
  insufficient_evidence: 0,
  low: 1,
  medium: 2,
  high: 3,
}

/**
 * Pick the MINIMUM (least confident) value across the aircraft that returned
 * data. When results are mixed, the minimum is the honest answer. Aircraft
 * with no confidence at all (undefined — e.g. no RAG evidence) are ignored
 * here; they are surfaced as "no records found" lines in the answer instead.
 */
function minConfidence(values: Array<string | undefined>): string | undefined {
  const known = values.filter(
    (v): v is string => typeof v === 'string' && Object.prototype.hasOwnProperty.call(CONFIDENCE_RANK, v),
  )
  if (known.length === 0) return undefined
  let lowest = known[0]
  for (const v of known) {
    if (CONFIDENCE_RANK[v] < CONFIDENCE_RANK[lowest]) lowest = v
  }
  return lowest
}

/** Run an array of async tasks with a hard concurrency cap, preserving order. */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit)
    const batchResults = await Promise.all(batch.map((item) => task(item)))
    results.push(...batchResults)
  }
  return results
}

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const rl = rateLimit(`ask:${ip}`, { limit: 15, windowSeconds: 60 })
  if (!rl.success) return rateLimitResponse(rl)

  const supabase = createServerSupabase()
  const orgContext = await resolveRequestOrgContext(req)
  if (!orgContext) {
    const { data: { user } } = await supabase.auth.getUser()
    return NextResponse.json({ error: user ? 'No organization' : 'Unauthorized' }, { status: user ? 403 : 401 })
  }
  const membership = orgContext.membership

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const question: string = String(body.question ?? '').trim()
  const aircraft_id: string | undefined = body.aircraft_id ?? undefined
  // Coerce legacy 'mechanic' inputs to 'shop' at the boundary (mig 119).
  const requestedPersona: AskPersona =
    body.persona === 'shop' || body.persona === 'mechanic' ? 'shop' : 'owner'
  const persona: AskPersona =
    requestedPersona === 'shop' && MECHANIC_ELIGIBLE_ROLES.has(String(membership.role))
      ? 'shop'
      : 'owner'
  const resolvedAircraftId = await resolveCanonicalAircraftId(
    supabase,
    orgContext.organizationId,
    aircraft_id
  )
  const conversation_history: Array<{ role: 'user' | 'assistant'; content: string }> =
    Array.isArray(body.conversation_history) ? body.conversation_history.slice(-10) : []

  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 })

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    // ── Single-aircraft path: aircraft_id is set ───────────────────────────────
    // Behavior is byte-identical to the pre-refactor inline loop.
    if (aircraft_id) {
      const result = await runAskAgent(req, openai, {
        question,
        persona,
        aircraftId: resolvedAircraftId ?? aircraft_id,
        conversationHistory: conversation_history,
      })
      return NextResponse.json({
        answer: result.answer,
        artifacts: result.artifacts.length > 0 ? result.artifacts : undefined,
        tool_calls_made: result.toolCalls.length > 0 ? result.toolCalls : undefined,
        confidence: result.confidence,
        citations: result.citations,
        warning_flags: [],
        follow_up_questions: result.followUps,
      })
    }

    // ── "All Aircraft" path: aircraft_id is undefined ──────────────────────────

    // 0. Structured fleet aggregation. RAG is bad at "oldest/newest entry
    //    across the fleet" and "how many aircraft have records before YEAR"
    //    — the vector search doesn't naturally retrieve the actual extremum,
    //    so the model synthesizes a confident-sounding wrong answer. Catch
    //    those queries BEFORE the LLM, run a real SQL aggregation on
    //    page_tree_nodes (with OCR-date sanitization), and short-circuit.
    //    Returns null for any query that doesn't match a structured pattern.
    //
    //    Motivated by the 40-question stress test on 2026-05-21 which found
    //    two high-confidence hallucinations on extremum queries.
    const structured = await tryFleetAggregation(question, {
      organizationId: orgContext.organizationId,
      supabase,
    })
    if (structured) {
      return NextResponse.json({
        answer: structured.answer,
        confidence: structured.confidence,
        citations: structured.citations,
        warning_flags: [],
        follow_up_questions: structured.follow_up_questions ?? [],
        aggregation: 'structured', // surfaces in logs; client can ignore
      })
    }

    // Classify the question: org_wide → one pass; per_aircraft → fan out.
    const kind = await classifyAskQuestion(question)

    // org_wide → existing single org-wide pass (aircraftId undefined). Unchanged.
    if (kind === 'org_wide') {
      const result = await runAskAgent(req, openai, {
        question,
        persona,
        aircraftId: undefined,
        conversationHistory: conversation_history,
      })
      return NextResponse.json({
        answer: result.answer,
        artifacts: result.artifacts.length > 0 ? result.artifacts : undefined,
        tool_calls_made: result.toolCalls.length > 0 ? result.toolCalls : undefined,
        confidence: result.confidence,
        citations: result.citations,
        warning_flags: [],
        follow_up_questions: result.followUps,
      })
    }

    // per_aircraft → fan out: one agent pass per aircraft, in parallel.
    const { data: fleetRows } = await supabase
      .from('aircraft')
      .select('id, tail_number')
      .eq('organization_id', orgContext.organizationId)
      .eq('is_archived', false)
      .order('tail_number', { ascending: true })

    const fleet: Array<{ id: string; tail_number: string }> = (fleetRows ?? [])
      .map((row) => ({
        id: typeof row.id === 'string' ? row.id : '',
        tail_number:
          typeof row.tail_number === 'string' && row.tail_number.trim()
            ? row.tail_number
            : 'Unknown tail',
      }))
      .filter((row) => row.id)

    // No aircraft to fan out over — degrade gracefully to a single org-wide pass.
    if (fleet.length === 0) {
      const result = await runAskAgent(req, openai, {
        question,
        persona,
        aircraftId: undefined,
        conversationHistory: conversation_history,
      })
      return NextResponse.json({
        answer: result.answer,
        artifacts: result.artifacts.length > 0 ? result.artifacts : undefined,
        tool_calls_made: result.toolCalls.length > 0 ? result.toolCalls : undefined,
        confidence: result.confidence,
        citations: result.citations,
        warning_flags: [],
        follow_up_questions: result.followUps,
      })
    }

    // Run one agent pass per aircraft. Concurrency capped at 10 — orgs with
    // more than 10 aircraft batch in groups of 10. A failure on one aircraft
    // degrades to a "no records found" line, never an uncaught throw.
    const perAircraft = await runWithConcurrency(fleet, 10, async (ac) => {
      try {
        const result = await runAskAgent(req, openai, {
          question,
          persona,
          aircraftId: ac.id,
          conversationHistory: conversation_history,
        })
        return { aircraft: ac, result, error: false }
      } catch (err) {
        console.error(`[api/ask] fan-out failed for ${ac.tail_number}:`, err)
        return { aircraft: ac, result: null as AskAgentResult | null, error: true }
      }
    })

    // Assemble ONE response. Every aircraft gets a section — never silently
    // omit. We process aircraft in fleet order and maintain a running global
    // citation offset: each aircraft's inline `[k]` markers are rewritten to
    // `[k + offset]` so they resolve against the single merged `citations`
    // array, and `offset` advances by that aircraft's citation count.
    const answerLines: string[] = []
    const mergedCitations: any[] = []
    const perAircraftSections: PerAircraftAnswer[] = []
    const mergedToolCalls = new Set<string>()
    const confidences: Array<string | undefined> = []
    let citationOffset = 0

    for (const { aircraft, result, error } of perAircraft) {
      const tail = aircraft.tail_number

      // A failed pass, a no-confidence pass, or an empty answer all surface as
      // "no records found" — the user still sees the tail listed.
      const hasData =
        !error &&
        result != null &&
        result.confidence !== undefined &&
        result.confidence !== 'insufficient_evidence' &&
        Boolean(result.answer && result.answer.trim())

      if (!hasData || !result) {
        const sectionAnswer =
          result?.confidence === 'low'
            ? 'Low confidence — verify against the source documents.'
            : 'No records found.'
        answerLines.push(`${tail} — ${sectionAnswer}`)
        perAircraftSections.push({ tail, answer: sectionAnswer, has_data: false })
        if (result?.confidence) confidences.push(result.confidence)
        continue
      }

      // Renumber this aircraft's inline `[k]` markers to `[k + offset]` so they
      // line up with where this aircraft's citations land in the merged array.
      const offset = citationOffset
      const renumbered = result.answer.replace(
        /\[(\d+)\]/g,
        (_m, k: string) => `[${parseInt(k, 10) + offset}]`,
      )

      // Flatten the per-aircraft answer onto a single line for the flat
      // backward-compat `answer` string; the structured section keeps the
      // multi-line answer with the globally-renumbered markers.
      const oneLine = renumbered.replace(/\s+/g, ' ').trim()
      answerLines.push(`${tail} — ${oneLine}`)
      perAircraftSections.push({ tail, answer: renumbered.trim(), has_data: true })
      confidences.push(result.confidence)

      // Merge citations in fleet order, labelling each with the tail so the UI
      // shows which aircraft it belongs to. We extend sectionTitle (an existing
      // optional field the UI already consumes) rather than introduce a new
      // shape. Advance the offset by this aircraft's citation count.
      const aircraftCitations = result.citations ?? []
      for (const cite of aircraftCitations) {
        if (cite && typeof cite === 'object') {
          const existingSection =
            typeof (cite as any).sectionTitle === 'string'
              ? (cite as any).sectionTitle
              : ''
          mergedCitations.push({
            ...cite,
            sectionTitle: existingSection
              ? `${tail} — ${existingSection}`
              : tail,
          })
        } else {
          mergedCitations.push(cite)
        }
      }
      citationOffset += aircraftCitations.length

      for (const t of result.toolCalls ?? []) mergedToolCalls.add(t)
    }

    return NextResponse.json({
      answer: answerLines.join('\n'),
      // Per-aircraft artifacts are intentionally omitted — a fleet-wide answer
      // is a text rollup, not a single actionable card.
      artifacts: undefined,
      // confidence = MINIMUM across aircraft that returned data. If results are
      // mixed, the least-confident value is the honest answer.
      confidence: minConfidence(confidences),
      citations: mergedCitations,
      // Structured per-aircraft sections so the UI can render each aircraft as
      // its own block. One entry per aircraft, fleet order, never omitted.
      per_aircraft: perAircraftSections,
      warning_flags: [],
      follow_up_questions: [],
      tool_calls_made: mergedToolCalls.size > 0 ? Array.from(mergedToolCalls) : undefined,
    })
  } catch (err: any) {
    console.error('[api/ask] Error:', err)
    return NextResponse.json(
      { error: err.message ?? 'An error occurred' },
      { status: 500 }
    )
  }
}
