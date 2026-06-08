/**
 * Support First-Responder agent.
 *
 * Inputs:
 *   - user question (text)
 *   - persona (owner | shop | mechanic | admin)
 *   - prior turns in this ticket, if any
 *
 * Steps:
 *   1. Look up the support KB for relevant published entries
 *      (BM25 via tsvector + keyword OR-match).
 *   2. Build a system prompt that constrains the answer to:
 *      - Use ONLY platform knowledge (the SOPs + KB entries)
 *      - Cite KB entry IDs in the answer
 *      - Refuse to answer questions outside the platform's scope
 *        (medical, legal, FAA advice, etc.) — those go to escalation
 *      - Detect a request that needs a human (refunds, deletions,
 *        access changes) and set needs_human=true
 *   3. Call GPT-4o with json_object response format
 *   4. Return { answer, confidence, cited_kb_ids, needs_human }
 *
 * Output is logged via the runner.
 */
// Migrated to the unified AI SDK layer (lib/ai/llm).
import { z } from 'zod'
import type { ModelMessage } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'
import { generateLlmObject } from '@/lib/ai/llm'

export interface SupportTurn {
  role: 'user' | 'assistant'
  content: string
  ts?: number
}

export interface SupportAnswer {
  answer: string
  confidence: 'high' | 'medium' | 'low' | 'refused'
  cited_kb_ids: string[]
  category:
    | 'billing'
    | 'how-to'
    | 'bug'
    | 'feature-request'
    | 'outage'
    | 'security'
    | 'other'
  needs_human: boolean
  follow_ups?: string[]
}

const SYSTEM_PROMPT = `You are myaircraft.us's support assistant. Your job is to help users (owners, shop staff, mechanics, admins) use the platform.

Rules:
- Answer ONLY using the knowledge-base entries provided below and your understanding of the platform documented in the SOPs.
- If the user asks something outside the platform's scope (medical advice, legal advice, real-world FAA airworthiness determinations, investment advice), politely refuse and suggest where they should go instead.
- If the user is asking for an action that requires human intervention (refunds, account deletion, access changes, security incidents, AD compliance advice), set needs_human=true and don't try to do it yourself — just acknowledge and tell them you've flagged it for the team.
- Cite KB entry ids in cited_kb_ids when you used one to ground your answer.
- Be brief. 2-4 paragraphs max.
- Use markdown for clarity (bold, lists, links to platform routes).
- If you don't know, say so plainly. Don't invent.

Categories: billing / how-to / bug / feature-request / outage / security / other.

Response format — STRICT JSON:
{
  "answer": "markdown text",
  "confidence": "high" | "medium" | "low" | "refused",
  "cited_kb_ids": ["uuid", ...],
  "category": "...",
  "needs_human": false,
  "follow_ups": ["suggested next question", ...]
}`

/** Permissive schema — built from primitives so a slightly off-spec model
 *  response coerces rather than throwing, mirroring the prior JSON.parse path.
 *  Fields that may be absent/null are nullable; downstream code defaults them. */
const SupportAnswerSchema = z.object({
  answer: z.string(),
  confidence: z.string(),
  cited_kb_ids: z.array(z.string()).nullable(),
  category: z.string(),
  needs_human: z.boolean().nullable(),
  follow_ups: z.array(z.string()).nullable(),
})

export async function answerSupportQuestion(args: {
  supabase: SupabaseClient
  triggeredBy?: string | null
  ticketId?: string
  question: string
  persona: 'owner' | 'shop' | 'mechanic' | 'admin'
  priorTurns?: SupportTurn[]
}): Promise<{
  ok: boolean
  output?: SupportAnswer
  recommendation?: Record<string, unknown> | null
  needsHuman?: boolean
  error?: string
  runId?: string
}> {
  return runAgent<SupportAnswer>(
    'support.first-responder',
    {
      supabase: args.supabase,
      triggeredBy: args.triggeredBy ?? null,
      target: args.ticketId ? { kind: 'support_ticket', id: args.ticketId } : undefined,
      input: {
        question: args.question,
        persona: args.persona,
        prior_turn_count: args.priorTurns?.length ?? 0,
      },
    },
    async (logger) => {
      // 1) Retrieve top KB entries
      const { data: kbRows } = await args.supabase
        .from('support_kb_entry')
        .select('id, title, body_md, category, sop_reference, keywords')
        .eq('status', 'published')
        .or(`persona_scope.cs.{${args.persona}},persona_scope.eq.{}`)
        .textSearch('search_tsv', args.question.split(/\s+/).slice(0, 8).join(' & '), {
          type: 'plain',
        })
        .limit(8)

      const kbContext = (kbRows ?? [])
        .map(
          (r: any) =>
            `[KB:${r.id}] ${r.title} (${r.category}${r.sop_reference ? ` · ${r.sop_reference}` : ''})\n${r.body_md.slice(0, 800)}`,
        )
        .join('\n\n---\n\n')

      // 2) Call the LLM
      if (!process.env.OPENAI_API_KEY) {
        return {
          output: {
            answer:
              'Support AI is temporarily unavailable. A human will follow up via email.',
            confidence: 'refused' as const,
            cited_kb_ids: [],
            category: 'other' as const,
            needs_human: true,
          },
          needsHuman: true,
        }
      }

      logger.recordModel('openai', 'gpt-4o')
      const t0 = Date.now()
      const messages: ModelMessage[] = [
        ...(args.priorTurns ?? []).map((t) => ({
          role: t.role as 'user' | 'assistant',
          content: t.content,
        })),
        {
          role: 'user' as const,
          content: `User persona: ${args.persona}\n\nKnowledge-base context:\n${kbContext || '(no KB entries matched)'}\n\nUser question: ${args.question}`,
        },
      ]
      let parsed: SupportAnswer
      try {
        const result = await generateLlmObject({
          model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
          schema: SupportAnswerSchema,
          temperature: 0,
          maxOutputTokens: 700,
          system: SYSTEM_PROMPT,
          messages,
        })
        logger.recordTokens(result.usage.inputTokens, result.usage.outputTokens)
        const obj = result.object
        parsed = {
          answer: obj.answer,
          confidence: obj.confidence as SupportAnswer['confidence'],
          cited_kb_ids: obj.cited_kb_ids ?? [],
          category: obj.category as SupportAnswer['category'],
          needs_human: obj.needs_human ?? false,
          follow_ups: obj.follow_ups ?? undefined,
        }
      } catch {
        parsed = {
          answer: 'I had trouble parsing my own response. A human will follow up.',
          confidence: 'refused',
          cited_kb_ids: [],
          category: 'other',
          needs_human: true,
        }
      }
      const ms = Date.now() - t0
      void ms

      // Validate cited_kb_ids
      const validKbIds = new Set((kbRows ?? []).map((r: any) => r.id))
      parsed.cited_kb_ids = (parsed.cited_kb_ids ?? []).filter((id) => validKbIds.has(id))

      // Bump KB use_count for cited entries (fire and forget)
      if (parsed.cited_kb_ids.length > 0) {
        await args.supabase
          .from('support_kb_entry')
          .update({ last_used_at: new Date().toISOString() })
          .in('id', parsed.cited_kb_ids)
      }

      return {
        output: parsed,
        needsHuman: !!parsed.needs_human || parsed.confidence === 'refused',
        recommendation:
          parsed.confidence === 'low'
            ? {
                kind: 'kb_draft_candidate',
                question: args.question,
                category: parsed.category,
                note: 'Low-confidence answer — KB curator should consider adding an entry.',
              }
            : null,
      }
    },
  )
}
