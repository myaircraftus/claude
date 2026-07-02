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
 *   { question: string, aircraft_id?: string | null, persona?: 'owner' | 'shop',
 *     thread_id?: string }
 * Conversation history is NOT sent by the client — it is loaded server-side
 * from the persisted thread (thread_messages). aircraft_id null = All Aircraft.
 *
 * Response:
 *   { answer: string, artifacts?: Artifact[], citations?: ..., tool_calls_made?: string[],
 *     thread_id: string | null }
 */

import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@ai-sdk/openai'
import { streamText, generateText, tool, stepCountIs, type ModelMessage } from 'ai'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { type AiToolName } from '@/lib/ai/tools'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { classifyAskQuestion } from '@/lib/ask/question-classifier'
import { tryFleetAggregation } from '@/lib/ask/fleet-aggregation'
import { gradeAnswer } from '@/lib/agents/impl/rag-answer-grader'
import { auditRagRetrieval } from '@/lib/agents/impl/safety-cross-tenant-leak-watchdog'
import { condenseFollowUp } from '@/lib/ask/condense'
import {
  resolveAskThread,
  loadAskHistory,
  appendAskMessage,
  touchAskThread,
} from '@/lib/ask/threads'

/**
 * Fire-and-forget answer grader. 1% sample of single-aircraft responses
 * get graded for faithfulness. Anything <3 emits a recommendation
 * surfaced in /admin/agents. Never blocks the user response.
 */
function maybeGradeAsync(args: {
  question: string
  answer: string
  citations: any[]
  askLogId?: string | null
}): void {
  if (Math.random() > 0.01) return
  // Best-effort. We never await. We swallow errors at the agent layer.
  void (async () => {
    try {
      const service = createServiceSupabase()
      const previews = (args.citations ?? []).slice(0, 6).map((c: any) => ({
        chunk_id: c?.chunk_id ?? c?.id,
        preview:
          typeof c?.preview === 'string'
            ? c.preview
            : typeof c?.snippet === 'string'
              ? c.snippet
              : '',
      }))
      await gradeAnswer({
        supabase: service,
        askLogId: args.askLogId ?? null,
        question: args.question,
        answer: args.answer,
        citations: previews,
      })
    } catch (err) {
      console.warn('[ask.grader] background grade failed:', (err as Error).message)
    }
  })()
}

/**
 * Fire-and-forget cross-tenant retrieval audit. 1% sample.
 *
 * Looks up the actual organization_id of every retrieved chunk and
 * compares it against the calling org. Any mismatch → CRITICAL
 * agent_run with needsHuman=true (worst possible bug class in
 * multi-tenant RAG).
 *
 * Designed to be cheap + safe to call on every answer because the
 * agent itself only fires the 1% guard:
 */
function maybeAuditTenantsAsync(args: {
  callingOrgId: string
  triggeredBy?: string | null
  question: string
  citations: any[]
}): void {
  if (Math.random() > 0.01) return
  void (async () => {
    try {
      const service = createServiceSupabase()
      const chunkIds: string[] = []
      for (const c of args.citations ?? []) {
        const id = (c as any)?.chunk_id ?? (c as any)?.id
        if (typeof id === 'string' && id.length > 0) chunkIds.push(id)
      }
      if (chunkIds.length === 0) return
      await auditRagRetrieval({
        supabase: service,
        triggeredBy: args.triggeredBy ?? null,
        callingOrgId: args.callingOrgId,
        question: args.question,
        chunkIds,
      })
    } catch (err) {
      console.warn(
        '[ask.cross-tenant-audit] background audit failed:',
        (err as Error).message,
      )
    }
  })()
}

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
  args: Record<string, unknown>,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
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

      // Light stemmer so morphological variants match: "replacement" must
      // find an entry that says "Replaced". Strips common suffixes only when
      // a useful stem (≥4 chars) remains — short words pass through untouched.
      const stem = (word: string) => {
        for (const suffix of ['ements', 'ement', 'ations', 'ation', 'ings', 'ing', 'ed', 'es', 's']) {
          if (word.endsWith(suffix) && word.length - suffix.length >= 4) {
            return word.slice(0, -suffix.length)
          }
        }
        return word
      }
      const stems = terms.map(stem)

      // Push the strongest single stem to the API for DB-side ILIKE (uses
      // existing index) — the stem keeps recall ("replac" matches both
      // "replaced" and "replacement"). Client-side scoring narrows below.
      const primaryStem =
        stems.find((t) => /\d/.test(t)) ?? [...stems].sort((a, b) => b.length - a.length)[0]
      if (primaryStem) params.search = primaryStem

      const data = await callInternalGet(req, '/api/logbook-entries', params) as any
      const entries = Array.isArray(data?.entries) ? data.entries : []

      // The API aliases `description` → `entry_text`. Score by how many query
      // stems appear; require at least half (was ALL terms as exact
      // substrings, which silently dropped near-matches — the "no records
      // found for the dry vacuum pump" bug).
      const minHits = Math.max(1, Math.ceil(stems.length / 2))
      const scored = stems.length > 0
        ? entries
            .map((e: any) => {
              const haystack = `${e.entry_text ?? e.description ?? ''} ${e.entry_type ?? ''} ${e.logbook_type ?? ''}`.toLowerCase()
              const hits = stems.filter((t) => haystack.includes(t)).length
              return { entry: e, hits }
            })
            .filter((s: { hits: number }) => s.hits >= minHits)
            // Best match first; ties keep the API's entry_date DESC order so
            // "latest" queries still surface the most recent matches.
            .sort((a: { hits: number }, b: { hits: number }) => b.hits - a.hits)
            .map((s: { entry: any }) => s.entry)
        : entries

      const limited = scored.slice(0, 10)

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
        // Forward the thread's prior turns so answer generation has the
        // conversational context (the agent already condenses the query
        // itself; this makes the grounding pass context-aware too).
        conversation_history: conversationHistory,
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
5. When looking up maintenance history, call BOTH search_documents AND search_logbook (when available) — recent work lives only in app logbook entries, older history only in scanned documents. Never state that no record exists unless both searches returned nothing.
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
// side-panel preview where the user can read, download, or share it.
//
// search_logbook is included too: entries created IN the app (signed
// entries, work-order-generated entries — i.e. all recent maintenance) only
// exist in the logbook_entries table, not in the uploaded PDFs, so without
// this tool owner mode was blind to everything after the paper logbook was
// scanned and confidently answered "no records found". The structured-rows
// artifact is an acceptable trade for actually finding the record.
const OWNER_TOOL_NAMES: readonly AiToolName[] = [
  'search_documents',
  'search_logbook',
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
- ALSO call search_logbook for any maintenance-history question: work done recently (after the paper logbook was scanned) lives ONLY in the app's logbook entries, not in the uploaded PDFs. Never conclude "no records found" until BOTH search_documents and search_logbook came back empty.
- For "find me the latest X" or "show me all X", call search_documents and cite EVERY matching passage with [N] markers — the user wants to scan the matches and click into the source PDF to read in context.
- Each [N] in your answer must correspond to a real document chunk you cited. The UI renders these as clickable links that open the cited page of the source PDF in a side panel for download and review.
- Do not draft maintenance entries, checklists, or mechanic workflow actions in owner mode. If the user asks for one, briefly explain they should switch to mechanic mode.`
}

/** The tool names available to a persona — owner gets search_documents only. */
function toolNamesForPersona(persona: AskPersona): Set<AiToolName> {
  return new Set(persona === 'shop' ? MECHANIC_TOOL_NAMES : OWNER_TOOL_NAMES)
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

/** Coarse client-facing progress stage for a dispatched tool (streaming only). */
const TOOL_STATUS: Record<string, string> = {
  search_documents: 'searching',
  search_logbook: 'searching',
  search_parts: 'searching',
  create_logbook_entry: 'drafting',
  generate_checklist: 'drafting',
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
  opts: {
    question: string
    persona: AskPersona
    aircraftId?: string
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
    /**
     * Streaming hooks for the web Ask experience. When `onToken` is provided,
     * the FINAL synthesis is streamed token-by-token and the tool-calling
     * rounds are consumed silently. When it is omitted, the agent runs in
     * blocking mode — byte-identical to the original inline loop (this is what
     * the "All Aircraft" fan-out and org-wide passes still use).
     */
    onToken?: (text: string) => void
    onStatus?: (stage: string) => void
    onMeta?: (meta: {
      citations: any[]
      confidence: string | undefined
      followUps: string[]
      artifacts: Artifact[]
    }) => void
    onReset?: () => void
  },
): Promise<AskAgentResult> {
  const { question, persona, aircraftId, conversationHistory } = opts
  const allowedToolNames = toolNamesForPersona(persona)

  // Build the conversation. The system prompt is passed to the SDK via the
  // dedicated `system` field; `messages` carries prior turns + this question.
  const messages: ModelMessage[] = [
    ...conversationHistory.map(
      (m) => ({ role: m.role, content: m.content } as ModelMessage),
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

  // ── AI SDK tool set ────────────────────────────────────────────────────────
  // Each tool's `execute` reuses the EXISTING dispatchTool (single source of
  // truth for tool logic), injects aircraft_id from context when the model
  // omits it (preserving the old loop's behavior), pushes any artifact /
  // citations / follow-ups / confidence into the outer collectors, and returns
  // the raw `result` object back to the model.
  //
  // aircraft_id is `.optional()` on every schema even though the OpenAI tool
  // defs marked it required for some tools: the SDK enforces the Zod schema
  // BEFORE execute runs, so a required aircraft_id would reject the call and
  // skip the context-injection fallback. OpenAI's function calling never hard-
  // enforced required-ness, so making it optional preserves the prior runtime
  // behavior (call still runs; aircraft_id is injected from context).
  const runTool = async (name: AiToolName, rawArgs: Record<string, unknown>) => {
    const args: Record<string, unknown> = { ...rawArgs }
    // Inject aircraft_id from context if not provided.
    if (!args.aircraft_id && aircraftId) {
      args.aircraft_id = aircraftId
    }
    toolCallsMade.push(name)
    const { result, artifact, citations: newCites, followUps, confidence } =
      await dispatchTool(req, name, args, conversationHistory)
    if (artifact) artifacts.push(artifact)
    if (newCites && newCites.length > 0) collectedCitations.push(...newCites)
    if (followUps && followUps.length > 0) collectedFollowUps.push(...followUps)
    if (confidence) ragConfidence = confidence
    // Return the tool result object to the model (was JSON.stringify'd into the
    // tool message in the old loop; the SDK serializes it for us).
    return result
  }

  const allTools = {
    search_documents: tool({
      description:
        'Semantic search over uploaded aircraft documents (logbooks, POH, manuals, ADs, SBs). Use for Q&A about aircraft records.',
      inputSchema: z.object({
        query: z.string().describe('The question or search text'),
        aircraft_id: z
          .string()
          .optional()
          .describe('UUID of the aircraft (optional — omit to search all aircraft)'),
      }),
      execute: async (args) => runTool('search_documents', args),
    }),
    search_logbook: tool({
      description:
        'Search logbook entries for an aircraft. Use when user asks to find or look up past logbook entries, maintenance history, or repair records.',
      inputSchema: z.object({
        query: z.string().describe('Search keyword (e.g. magneto, annual, oil change)'),
        aircraft_id: z.string().optional().describe('UUID of the aircraft'),
      }),
      execute: async (args) => runTool('search_logbook', args),
    }),
    search_parts: tool({
      description:
        'Search the parts catalog / marketplace for a specific part for an aircraft. Use when user asks to find, search, or look up parts.',
      inputSchema: z.object({
        query: z.string().describe('Part description, part number, or keyword'),
        aircraft_id: z.string().optional().describe('UUID of the aircraft for context'),
      }),
      execute: async (args) => runTool('search_parts', args),
    }),
    create_logbook_entry: tool({
      description:
        'Draft a maintenance logbook entry for the mechanic to review and sign. Use when the user asks to create, generate, or draft a logbook entry.',
      inputSchema: z.object({
        aircraft_id: z.string().optional().describe('UUID of the aircraft'),
        entry_type: z
          .enum([
            '100hr',
            'annual',
            'oil_change',
            'ad_compliance',
            'repair',
            'maintenance',
            'discrepancy',
            'sb_compliance',
            'component_replacement',
            'return_to_service',
            'major_repair',
            'major_alteration',
            'owner_preventive',
          ])
          .optional(),
        description: z.string().describe('Plain-language description of the work done'),
      }),
      execute: async (args) => runTool('create_logbook_entry', args),
    }),
    generate_checklist: tool({
      description:
        'Generate a work order / inspection checklist. Use when user asks to create a checklist for an annual, 100hr, AD, or other maintenance task.',
      inputSchema: z.object({
        scope: z.enum(['annual', '100hr', 'AD', 'SB', 'custom']).describe('Type of checklist'),
        aircraft_id: z.string().optional().describe('UUID of the aircraft'),
        reference: z
          .string()
          .optional()
          .describe('AD or SB reference number if scope is AD or SB'),
        prompt: z.string().optional().describe('Free-text description if scope is custom'),
      }),
      execute: async (args) => runTool('generate_checklist', args),
    }),
  } as const

  // Filter to the persona's allowed tools (owner → search_documents only).
  const tools = Object.fromEntries(
    Object.entries(allTools).filter(([name]) => allowedToolNames.has(name as AiToolName)),
  )

  const model = openai.chat(process.env.OPENAI_CHAT_MODEL || 'gpt-4o')
  const system = buildSystemPrompt(persona)
  // stepCountIs(3) preserves the old "max 3 rounds" tool-calling budget.
  const stopWhen = stepCountIs(3)
  const streaming = typeof opts.onToken === 'function'

  if (streaming) {
    const result = streamText({
      model,
      system,
      messages,
      tools,
      stopWhen,
      temperature: 0.3,
      maxOutputTokens: 1500,
    })

    // Track, PER STEP, whether we've streamed any answer tokens yet — needed to
    // replicate the old onReset() "preamble" behavior: if a step streamed prose
    // and THEN issues tool calls, that prose is not the final answer, so we
    // reset the client's accumulated answer and let a later step stream the
    // real one. Reset the flag at each step boundary.
    let stepStreamedText = false
    let startedAnswer = false
    // Whether any tool ran in the current step — gates onMeta emission so we
    // only push citations/confidence/artifacts after a step that actually
    // called tools (matching the old per-round onMeta), before the next step's
    // answer tokens stream.
    let stepHadToolCall = false

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'start-step': {
          stepStreamedText = false
          stepHadToolCall = false
          break
        }
        case 'text-delta': {
          // text-delta on the public stream carries the chunk in `.text`.
          if (part.text.length === 0) break
          stepStreamedText = true
          if (!startedAnswer) {
            startedAnswer = true
            opts.onStatus?.('writing')
          }
          opts.onToken?.(part.text)
          break
        }
        case 'tool-call': {
          // The model issued a tool call this step. If we already streamed
          // answer prose this step, it was a preamble — discard it client-side.
          if (stepStreamedText && startedAnswer) {
            opts.onReset?.()
            startedAnswer = false
            stepStreamedText = false
          }
          stepHadToolCall = true
          opts.onStatus?.(TOOL_STATUS[part.toolName] ?? 'working')
          break
        }
        case 'finish-step': {
          // All tool results for this step have resolved (their `execute`
          // populated the collectors). Push citations/confidence/follow-ups/
          // artifacts to the client BEFORE the next step's answer tokens so
          // inline [N] markers resolve against a populated list as they arrive.
          if (stepHadToolCall) {
            opts.onMeta?.({
              citations: [...collectedCitations],
              confidence: ragConfidence,
              followUps: [...collectedFollowUps],
              artifacts: [...artifacts],
            })
          }
          break
        }
        case 'error': {
          // Surface to the caller's try/catch so the route emits an error event.
          throw part.error
        }
        default:
          break
      }
    }

    // Final answer = the text generated in the last step. If the step budget
    // was exhausted while still calling tools, the last step produces no prose
    // — fall back to the same canned line the old loop returned on exhaustion.
    const finalText = await result.text
    const answer = finalText.trim().length > 0
      ? finalText
      : toolCallsMade.length > 0
        ? 'I gathered some results for you. See the cards below.'
        : finalText

    return {
      answer,
      artifacts,
      // Confidence reflects RAG evidence only — never hard-code 'high' just
      // because a non-RAG tool produced an artifact (audit fix: an artifact is
      // not evidence of answer accuracy).
      confidence: ragConfidence,
      citations: collectedCitations,
      followUps: collectedFollowUps,
      toolCalls: toolCallsMade,
    }
  }

  // ── Blocking mode (no onToken) — "All Aircraft" fan-out + org-wide passes. ──
  const result = await generateText({
    model,
    system,
    messages,
    tools,
    stopWhen,
    temperature: 0.3,
    maxOutputTokens: 1500,
  })

  // Same exhaustion fallback as streaming mode (old loop returned this canned
  // line when the 3-round budget ran out with tool calls still pending).
  const answer = result.text.trim().length > 0
    ? result.text
    : toolCallsMade.length > 0
      ? 'I gathered some results for you. See the cards below.'
      : result.text

  return {
    answer,
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
  // Scope selection. The client sends an explicit aircraft_id (UUID) for a
  // specific tail, or null for "All Aircraft". A persisted thread carries its
  // own scope so reopening it restores the selection.
  const requestedAircraftId: string | null =
    typeof body.aircraft_id === 'string' && body.aircraft_id ? body.aircraft_id : null
  const requestedThreadId: string | null =
    typeof body.thread_id === 'string' && body.thread_id ? body.thread_id : null
  // Coerce legacy 'mechanic' inputs to 'shop' at the boundary (mig 119).
  const requestedPersona: AskPersona =
    body.persona === 'shop' || body.persona === 'mechanic' ? 'shop' : 'owner'
  const persona: AskPersona =
    requestedPersona === 'shop' && MECHANIC_ELIGIBLE_ROLES.has(String(membership.role))
      ? 'shop'
      : 'owner'
  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 })

  // Opt-in token streaming (web Ask experience sends { stream: true }). Other
  // callers (mobile, internal /api/chat, query bars) never set it and keep
  // getting the JSON response unchanged.
  const wantsStream = body.stream === true

  // The @ai-sdk/openai provider reads OPENAI_API_KEY from the environment
  // automatically (guarded above), so there's no client to construct here.
  const orgId = orgContext.organizationId
  const userId = orgContext.user.id

  // ── Conversational context — two calling modes ──
  //  • Persistence mode (web Ask experience): the client sends a `thread_id`
  //    KEY (null for a new chat). The thread + history live in the DB; we
  //    resolve/create the thread, load prior turns, and persist this turn.
  //  • Stateless mode (internal callers like /api/chat that manage their own
  //    history and send NO `thread_id` key): honor the body's
  //    conversation_history verbatim and persist nothing.
  // Best-effort: any persistence failure degrades to a stateless answer.
  const persistThread = Object.prototype.hasOwnProperty.call(body, 'thread_id')
  let threadId: string | null = null
  let scopeAircraftId: string | null = requestedAircraftId
  let history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  if (persistThread) {
    try {
      const resolvedThread = await resolveAskThread(supabase, {
        organizationId: orgId,
        userId,
        threadId: requestedThreadId,
        firstMessage: question,
        aircraftId: requestedAircraftId,
        persona,
      })
      if (resolvedThread) {
        threadId = resolvedThread.threadId
        scopeAircraftId = resolvedThread.aircraftId
        history = await loadAskHistory(supabase, threadId, orgId, 10)
        await appendAskMessage(supabase, {
          threadId,
          organizationId: orgId,
          userId,
          role: 'user',
          content: question,
          metadata: { aircraft_id: scopeAircraftId },
        })
      }
    } catch (threadErr) {
      console.warn('[api/ask] thread setup failed (stateless fallback):', (threadErr as Error).message)
    }
  } else if (Array.isArray(body.conversation_history)) {
    // Legacy/internal caller owns its history; nothing is persisted here.
    history = body.conversation_history
      .filter(
        (m: any) =>
          (m?.role === 'user' || m?.role === 'assistant') &&
          typeof m?.content === 'string' &&
          m.content.trim().length > 0,
      )
      .slice(-10)
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 2000) }))
  }

  // Canonicalize the (possibly thread-pinned) aircraft scope.
  const resolvedAircraftId = await resolveCanonicalAircraftId(
    supabase,
    orgId,
    scopeAircraftId ?? undefined,
  )

  // Rewrite a context-dependent follow-up ("who signed it?") into a
  // standalone query so retrieval doesn't drift to an unrelated document.
  // No-op for the first turn or an already-standalone question.
  const searchQuestion = await condenseFollowUp(history, question)

  // Persist the assistant answer + advance the thread, then respond. Every
  // success path funnels through here so persistence lives in exactly one
  // place and the response always carries thread_id back to the client.
  // Persist the assistant turn for a resolved thread. Shared by the JSON
  // `finalize` path and the streaming path so persistence lives in one place.
  const persistAssistantTurn = async (payload: Record<string, any>): Promise<void> => {
    if (!threadId) return
    await appendAskMessage(supabase, {
      threadId,
      organizationId: orgId,
      userId,
      role: 'assistant',
      content: typeof payload.answer === 'string' ? payload.answer : '',
      metadata: {
        confidence: payload.confidence ?? null,
        citations: payload.citations ?? [],
        follow_up_questions: payload.follow_up_questions ?? [],
        warning_flags: payload.warning_flags ?? [],
        artifacts: payload.artifacts ?? null,
        per_aircraft: payload.per_aircraft ?? null,
        tool_calls: payload.tool_calls_made ?? null,
      },
    })
    await touchAskThread(supabase, threadId, orgId)
  }

  const finalize = async (payload: Record<string, any>): Promise<NextResponse> => {
    await persistAssistantTurn(payload)
    return NextResponse.json({ ...payload, thread_id: threadId })
  }

  try {
    // ── Streaming path (web Ask experience, single-aircraft only) ──────────────
    // Opt-in via { stream: true }. We stream ONLY the single-aircraft agent
    // pass — "All Aircraft" (structured / org-wide / fan-out) still returns
    // JSON, and the client falls back via the response Content-Type. NDJSON
    // event protocol: thread_id → status* → meta* → token* → done | error.
    if (wantsStream && scopeAircraftId) {
      const aircraftForAgent = resolvedAircraftId ?? scopeAircraftId
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let closed = false
          const send = (obj: unknown) => {
            if (closed) return
            try {
              controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
            } catch {
              /* client disconnected — stop enqueuing, persistence still runs */
            }
          }
          let answerAccum = ''
          let persisted = false
          try {
            // thread_id is known up front so the client can pin the thread even
            // if the stream dies mid-answer.
            send({ type: 'thread_id', thread_id: threadId })
            send({ type: 'status', stage: 'thinking' })

            const result = await runAskAgent(req, {
              question: searchQuestion,
              persona,
              aircraftId: aircraftForAgent,
              conversationHistory: history,
              onStatus: (stage) => send({ type: 'status', stage }),
              onMeta: (meta) =>
                send({
                  type: 'meta',
                  citations: meta.citations,
                  confidence: meta.confidence,
                  follow_up_questions: meta.followUps,
                  artifacts: meta.artifacts.length > 0 ? meta.artifacts : undefined,
                }),
              onToken: (text) => {
                answerAccum += text
                send({ type: 'token', text })
              },
              onReset: () => {
                answerAccum = ''
                send({ type: 'reset' })
              },
            })

            maybeGradeAsync({ question, answer: result.answer, citations: result.citations })
            maybeAuditTenantsAsync({
              callingOrgId: orgId,
              triggeredBy: userId,
              question,
              citations: result.citations,
            })

            const payload = {
              answer: result.answer,
              artifacts: result.artifacts.length > 0 ? result.artifacts : undefined,
              tool_calls_made: result.toolCalls.length > 0 ? result.toolCalls : undefined,
              confidence: result.confidence,
              citations: result.citations,
              warning_flags: [],
              follow_up_questions: result.followUps,
            }
            await persistAssistantTurn(payload)
            persisted = true
            // The done event carries the authoritative full bundle; the client
            // replaces its streamed-in content with this on completion.
            send({ type: 'done', ...payload, thread_id: threadId })
          } catch (err) {
            console.error('[api/ask] stream error:', err)
            send({ type: 'error', message: (err as Error)?.message ?? 'An error occurred' })
          } finally {
            // Persist even if the client disconnected mid-stream, so a thread
            // never reopens with a dangling user message and no reply.
            if (!persisted && threadId) {
              await appendAskMessage(supabase, {
                threadId,
                organizationId: orgId,
                userId,
                role: 'assistant',
                content: answerAccum || 'Sorry — something went wrong answering that. Please try again.',
                metadata: answerAccum ? { partial: true } : { error: true },
              }).catch(() => {})
              await touchAskThread(supabase, threadId, orgId).catch(() => {})
            }
            closed = true
            try { controller.close() } catch { /* already closed */ }
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          // Defeat proxy buffering (e.g. nginx) so tokens flush immediately.
          'X-Accel-Buffering': 'no',
        },
      })
    }

    // ── Single-aircraft path: aircraft_id is set ───────────────────────────────
    // Behavior is byte-identical to the pre-refactor inline loop.
    if (scopeAircraftId) {
      const result = await runAskAgent(req, {
        question: searchQuestion,
        persona,
        aircraftId: resolvedAircraftId ?? scopeAircraftId,
        conversationHistory: history,
      })
      maybeGradeAsync({
        question,
        answer: result.answer,
        citations: result.citations,
      })
      maybeAuditTenantsAsync({
        callingOrgId: orgId,
        triggeredBy: userId,
        question,
        citations: result.citations,
      })
      return finalize({
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
    const structured = await tryFleetAggregation(searchQuestion, {
      organizationId: orgId,
      supabase,
    })
    if (structured) {
      return finalize({
        answer: structured.answer,
        confidence: structured.confidence,
        citations: structured.citations,
        warning_flags: [],
        follow_up_questions: structured.follow_up_questions ?? [],
        aggregation: 'structured', // surfaces in logs; client can ignore
      })
    }

    // Classify the question: org_wide → one pass; per_aircraft → fan out.
    const kind = await classifyAskQuestion(searchQuestion)

    // org_wide → existing single org-wide pass (aircraftId undefined). Unchanged.
    if (kind === 'org_wide') {
      const result = await runAskAgent(req, {
        question: searchQuestion,
        persona,
        aircraftId: undefined,
        conversationHistory: history,
      })
      return finalize({
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
      const result = await runAskAgent(req, {
        question: searchQuestion,
        persona,
        aircraftId: undefined,
        conversationHistory: history,
      })
      return finalize({
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
        const result = await runAskAgent(req, {
          question: searchQuestion,
          persona,
          aircraftId: ac.id,
          conversationHistory: history,
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

    return finalize({
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
    // Record a placeholder assistant turn so a half-failed thread doesn't
    // reopen with a dangling user message and no reply. Best-effort.
    if (threadId) {
      await appendAskMessage(supabase, {
        threadId,
        organizationId: orgId,
        userId,
        role: 'assistant',
        content: 'Sorry — something went wrong answering that. Please try again.',
        metadata: { error: true },
      }).catch(() => {})
    }
    return NextResponse.json(
      { error: err.message ?? 'An error occurred' },
      { status: 500 }
    )
  }
}
