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
 *   { question: string, aircraft_id?: string, conversation_history?: ConversationTurn[] }
 *
 * Response:
 *   { answer: string, artifacts?: Artifact[], citations?: ..., tool_calls_made?: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabase } from '@/lib/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { AI_TOOLS } from '@/lib/ai/tools'

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
  return res.json()
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
  return res.json()
}

// ── Tool dispatcher ────────────────────────────────────────────────────────────

async function dispatchTool(
  req: NextRequest,
  name: string,
  args: Record<string, unknown>
): Promise<{ result: unknown; artifact?: Artifact }> {
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
      const data = await callInternalGet(req, '/api/logbook-entries', params) as any

      // Client-side keyword filter on the result set (simple contains)
      const keyword = String(args.query ?? '').toLowerCase()
      const entries = Array.isArray(data?.entries) ? data.entries : []
      const filtered = keyword
        ? entries.filter((e: any) =>
            String(e.description ?? '').toLowerCase().includes(keyword) ||
            String(e.entry_type ?? '').toLowerCase().includes(keyword)
          )
        : entries

      const artifact: Artifact = {
        type: 'logbook_entries',
        title: `Logbook: "${args.query}"`,
        data: { entries: filtered.slice(0, 10) },
        aircraft_id: args.aircraft_id as string | undefined,
        action_url: `/maintenance${args.aircraft_id ? `?aircraft_id=${args.aircraft_id}` : ''}`,
      }
      return { result: { entries: filtered.slice(0, 10) }, artifact }
    }

    case 'search_documents': {
      // Use the existing RAG pipeline via /api/query
      const data = await callInternal(req, '/api/query', {
        question: args.query,
        aircraft_id: args.aircraft_id,
        conversation_history: [],
      })
      // No artifact card for document search — answer is woven into the final text
      return { result: data }
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

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const rl = rateLimit(`ask:${ip}`, { limit: 15, windowSeconds: 60 })
  if (!rl.success) return rateLimitResponse(rl)

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const question: string = String(body.question ?? '').trim()
  const aircraft_id: string | undefined = body.aircraft_id ?? undefined
  const conversation_history: Array<{ role: 'user' | 'assistant'; content: string }> =
    Array.isArray(body.conversation_history) ? body.conversation_history.slice(-10) : []

  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 })

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  // Build initial messages
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversation_history.map(m => ({ role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam)),
    {
      role: 'user',
      content: aircraft_id
        ? `[Context: aircraft_id=${aircraft_id}]\n\n${question}`
        : question,
    },
  ]

  const artifacts: Artifact[] = []
  const toolCallsMade: string[] = []

  try {
    // ── Tool-calling loop (max 3 rounds) ───────────────────────────────────────
    let round = 0
    while (round < 3) {
      round++

      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
        temperature: 0.3,
        max_tokens: 1500,
        tools: AI_TOOLS as OpenAI.Chat.ChatCompletionTool[],
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
          // RAG-style fields empty when tools were used
          confidence: artifacts.length > 0 ? 'high' : undefined,
          citations: [],
          warning_flags: [],
          follow_up_questions: [],
        })
      }

      // Dispatch each tool call
      const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = []
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* ignore */ }

        // Inject aircraft_id from context if not provided
        if (!args.aircraft_id && aircraft_id) {
          args.aircraft_id = aircraft_id
        }

        toolCallsMade.push(tc.function.name)
        const { result, artifact } = await dispatchTool(req, tc.function.name, args)
        if (artifact) artifacts.push(artifact)

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
      citations: [],
      warning_flags: [],
      follow_up_questions: [],
    })
  } catch (err: any) {
    console.error('[api/ask] Error:', err)
    return NextResponse.json(
      { error: err.message ?? 'An error occurred' },
      { status: 500 }
    )
  }
}
