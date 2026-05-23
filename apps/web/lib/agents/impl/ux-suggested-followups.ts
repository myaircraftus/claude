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
import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface FollowupsOutput {
  follow_ups: string[]
}

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
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      logger.recordModel('openai', 'gpt-4o-mini')
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_FOLLOWUP_MODEL || 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 160,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Q: ${args.question.slice(0, 600)}\n\nA: ${args.answer.slice(
              0,
              1200,
            )}\n\nReturn JSON.`,
          },
        ],
      })
      const usage = completion.usage
      if (usage) logger.recordTokens(usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0)
      let parsed: { follow_ups?: unknown } = {}
      try {
        parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
      } catch {
        // ignore
      }
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
