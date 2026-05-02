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
8. For safety-critical items (ADs, limits, emergency procedures), always note the user should verify with the actual document and a qualified aviation professional.`

type AskPersona = 'owner' | 'mechanic'

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
  if (persona === 'mechanic') {
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
  const allowed = new Set(persona === 'mechanic' ? MECHANIC_TOOL_NAMES : OWNER_TOOL_NAMES)
  return AI_TOOLS.filter((tool) => allowed.has(tool.function.name as AiToolName)) as OpenAI.Chat.ChatCompletionTool[]
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
  const requestedPersona: AskPersona = body.persona === 'mechanic' ? 'mechanic' : 'owner'
  const persona: AskPersona =
    requestedPersona === 'mechanic' && MECHANIC_ELIGIBLE_ROLES.has(String(membership.role))
      ? 'mechanic'
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
  const personaTools = toolsForPersona(persona)

  // Build initial messages
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(persona) },
    ...conversation_history.map(m => ({ role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam)),
    {
      role: 'user',
      content: aircraft_id
        ? `[Context: aircraft_id=${resolvedAircraftId ?? aircraft_id}]\n\n${question}`
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

  try {
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
        const answer = msg.content ?? ''
        return NextResponse.json({
          answer,
          artifacts: artifacts.length > 0 ? artifacts : undefined,
          tool_calls_made: toolCallsMade.length > 0 ? toolCallsMade : undefined,
          // Propagate RAG citations + metadata captured from any search_documents calls
          confidence: ragConfidence ?? (artifacts.length > 0 ? 'high' : undefined),
          citations: collectedCitations,
          warning_flags: [],
          follow_up_questions: collectedFollowUps,
        })
      }

      // Dispatch each tool call
      const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = []
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* ignore */ }

        // Inject aircraft_id from context if not provided
        if (!args.aircraft_id && resolvedAircraftId) {
          args.aircraft_id = resolvedAircraftId
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

    // If we exhaust rounds, return what we have
    return NextResponse.json({
      answer: 'I gathered some results for you. See the cards below.',
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      tool_calls_made: toolCallsMade,
      citations: collectedCitations,
      warning_flags: [],
      follow_up_questions: collectedFollowUps,
      confidence: ragConfidence,
    })
  } catch (err: any) {
    console.error('[api/ask] Error:', err)
    return NextResponse.json(
      { error: err.message ?? 'An error occurred' },
      { status: 500 }
    )
  }
}
