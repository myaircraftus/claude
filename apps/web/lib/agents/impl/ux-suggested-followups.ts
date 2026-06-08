/**
 * Suggested Follow-ups — formal version of the inline follow-ups
 * already generated in /api/ask. Exposes the same logic as an
 * agent invocation so we can:
 *   - audit how often it fires + its latency
 *   - call it from non-/ask surfaces (e.g. the WO chat assistant)
 *   - swap models without touching /api/ask
 *
 * Returns up to 3 short, natural-language follow-ups that the user
 * might ask next given the question + answer.
 */
// Migrated to the unified AI SDK layer (lib/ai/llm).
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'
import { generateLlmObject } from '@/lib/ai/llm'

export interface FollowupsOutput {
  follow_ups: string[]
}

/** Permissive schema — the post-parse filtering below enforces the real
 *  constraints (string, length, max 3), mirroring the prior JSON.parse path. */
const FollowupsSchema = z.object({
  follow_ups: z.array(z.string()).nullable(),
})

const SYSTEM_PROMPT = `You generate 2-3 short follow-up questions a user might naturally ask next, given the prior question and the answer they just got.

Rules:
- Each follow-up <= 12 words.
- Phrased as a real question the user would type.
- Don't restate the original question.
- Don't suggest something the user just got an answer for.
- Return STRICT JSON: { "follow_ups": ["...", "...", "..."] }`

export async function suggestFollowups(args: {
  supabase: SupabaseClient
  triggeredBy?: string | null
  /** Optional ask-run / ticket id this fired for. */
  parentId?: string
  parentKind?: string
  question: string
  answer: string
}): Promise<{ ok: boolean; output?: FollowupsOutput; runId?: string; error?: string }> {
  return runAgent<FollowupsOutput>(
    'ux-help.suggested-followups',
    {
      supabase: args.supabase,
      triggeredBy: args.triggeredBy ?? null,
      target: args.parentId && args.parentKind
        ? { kind: args.parentKind, id: args.parentId }
        : undefined,
      input: { question_chars: args.question.length, answer_chars: args.answer.length },
    },
    async (logger) => {
      if (!process.env.OPENAI_API_KEY) {
        return { output: { follow_ups: [] } }
      }
      logger.recordModel('openai', 'gpt-4o-mini')
      const result = await generateLlmObject({
        model: process.env.OPENAI_FOLLOWUP_MODEL || 'gpt-4o-mini',
        schema: FollowupsSchema,
        temperature: 0.3,
        maxOutputTokens: 160,
        system: SYSTEM_PROMPT,
        prompt: `Q: ${args.question.slice(0, 600)}\n\nA: ${args.answer.slice(
          0,
          1200,
        )}\n\nReturn JSON.`,
      })
      logger.recordTokens(result.usage.inputTokens, result.usage.outputTokens)
      const parsed: { follow_ups?: unknown } = result.object
      const follow_ups = Array.isArray(parsed.follow_ups)
        ? parsed.follow_ups
            .filter((q): q is string => typeof q === 'string')
            .map((q) => q.trim())
            .filter((q) => q.length > 0 && q.length <= 140)
            .slice(0, 3)
        : []
      return { output: { follow_ups } }
    },
  )
}
