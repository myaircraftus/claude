/**
 * ux-help.error-explainer
 *
 * When a 5xx or uncaught client error surfaces in the app, the
 * client-side error boundary can POST the error payload here. The
 * agent rewrites the dev-facing message into one user-facing sentence
 * plus a "try this" suggestion. The boundary renders that copy in
 * place of the raw stack trace.
 *
 * Cheap LLM. Falls back to a static phrase when the OpenAI key is
 * missing or the error matches a well-known pattern (5xx → "We hit
 * a hiccup on our side. Try again in a moment.").
 */
// Migrated to the unified AI SDK layer (lib/ai/llm).
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'
import { generateLlmObject } from '@/lib/ai/llm'

export interface ErrorExplainOutput {
  user_message: string
  suggestion: string
  retry_safe: boolean
}

/** Permissive schema — primitives only; the post-parse defaulting/clamping
 *  below keeps behavior identical to the prior JSON.parse path. */
const ErrorExplainSchema = z.object({
  user_message: z.string().nullable(),
  suggestion: z.string().nullable(),
  retry_safe: z.boolean().nullable(),
})

const FALLBACKS: Array<{ pattern: RegExp; out: ErrorExplainOutput }> = [
  {
    pattern: /^(unauth|401|403)/i,
    out: {
      user_message: 'You need to sign in again.',
      suggestion: 'Try refreshing the page; you may have been signed out.',
      retry_safe: false,
    },
  },
  {
    pattern: /^(404|not[\s_-]?found)/i,
    out: {
      user_message: "We couldn't find what you were looking for.",
      suggestion: 'Try going back and re-opening it; the record may have moved.',
      retry_safe: true,
    },
  },
  {
    pattern: /^(429|rate[\s_-]?limit)/i,
    out: {
      user_message: 'Too many requests at once.',
      suggestion: 'Wait about 30 seconds and try again.',
      retry_safe: true,
    },
  },
  {
    pattern: /timeout|network|fetch/i,
    out: {
      user_message: 'Network hiccup — we couldn’t reach the server.',
      suggestion: 'Check your connection and try again.',
      retry_safe: true,
    },
  },
]

const SYSTEM_PROMPT = `You are myaircraft.us's error-explainer. You read one developer-facing error (HTTP status + message + optional stack frame) and rewrite it into a user-friendly explanation.

Rules:
- user_message ≤ 14 words. No jargon, no stack traces.
- suggestion ≤ 18 words. Concrete next action.
- retry_safe true only if a retry is genuinely safe (idempotent GETs are safe; POSTs that might double-charge or double-send are NOT).
- Return STRICT JSON: { "user_message": "...", "suggestion": "...", "retry_safe": true|false }`

export async function explainError(args: {
  supabase: SupabaseClient
  triggeredBy?: string | null
  status: number | null
  message: string
  /** Optional route/path the error happened on. */
  path?: string | null
}): Promise<{ ok: boolean; output?: ErrorExplainOutput; runId?: string; error?: string }> {
  return runAgent<ErrorExplainOutput>(
    'ux-help.error-explainer',
    {
      supabase: args.supabase,
      triggeredBy: args.triggeredBy ?? null,
      input: { status: args.status, path: args.path ?? null, message_chars: args.message.length },
    },
    async (logger) => {
      // Heuristic fast-path — most errors fit a known shape
      for (const f of FALLBACKS) {
        if (f.pattern.test(args.message) || f.pattern.test(String(args.status ?? ''))) {
          return { output: f.out }
        }
      }
      // 5xx generic
      if (args.status != null && args.status >= 500) {
        return {
          output: {
            user_message: 'Something glitched on our side.',
            suggestion: 'Try again in a moment. If it keeps happening, ping support from the launcher.',
            retry_safe: true,
          },
        }
      }
      if (!process.env.OPENAI_API_KEY) {
        return {
          output: {
            user_message: "We couldn't complete that action.",
            suggestion: 'Try again — and if it keeps failing, hit Help in the launcher.',
            retry_safe: true,
          },
        }
      }
      logger.recordModel('openai', 'gpt-4o-mini')
      const result = await generateLlmObject({
        model: process.env.OPENAI_ERROR_EXPLAINER_MODEL || 'gpt-4o-mini',
        schema: ErrorExplainSchema,
        temperature: 0.1,
        maxOutputTokens: 200,
        system: SYSTEM_PROMPT,
        prompt: [
          `HTTP status: ${args.status ?? '(none)'}`,
          `Path: ${args.path ?? '(unknown)'}`,
          `Message: ${args.message.slice(0, 800)}`,
          '',
          'Return JSON.',
        ].join('\n'),
      })
      logger.recordTokens(result.usage.inputTokens, result.usage.outputTokens)
      const parsed: Partial<ErrorExplainOutput> = {
        user_message: result.object.user_message ?? undefined,
        suggestion: result.object.suggestion ?? undefined,
        retry_safe: result.object.retry_safe ?? undefined,
      }
      return {
        output: {
          user_message: (parsed.user_message ?? "We couldn't complete that.").slice(0, 200),
          suggestion: (parsed.suggestion ?? 'Try again, or hit Help in the launcher.').slice(0, 220),
          retry_safe: typeof parsed.retry_safe === 'boolean' ? parsed.retry_safe : true,
        },
      }
    },
  )
}
