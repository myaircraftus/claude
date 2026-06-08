/**
 * ux-help.bug-triage
 *
 * Chained agent. When a support ticket is classified category='bug',
 * support.triage chains us to extract a structured reproduction from
 * the user's free-text. Output:
 *
 *   { browser, route, persona, action, expected, actual, severity }
 *
 * We use gpt-4o-mini with strict JSON output. If OPENAI_API_KEY is
 * absent, fall back to a heuristic that pulls the user-agent line,
 * the first URL-like token, and a 1-line narrative from the ticket
 * subject + body.
 *
 * Emits 'bug_repro_drafted' recommendation. Founder reviews on
 * /admin/agents and clicks "File issue" to push to Linear / GitHub.
 */
// Migrated to the unified AI SDK layer (lib/ai/llm).
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'
import { generateLlmObject } from '@/lib/ai/llm'
import { guardPromptInjection } from './safety-prompt-injection-guard'

/** Cap body size before sending to the LLM. Keeps prompts bounded AND
 *  reduces the surface area for an attacker hiding instructions deep
 *  in a long body. */
const MAX_BODY_CHARS = 4000

export interface BugRepro {
  ticket_id: string
  browser: string | null
  route: string | null
  persona: 'owner' | 'mechanic' | 'admin' | 'unknown'
  action: string
  expected: string | null
  actual: string | null
  severity: 'low' | 'medium' | 'high' | 'critical'
  source: 'llm' | 'heuristic'
}

/** Permissive schema — primitives + nullable; the post-parse coercion below
 *  narrows persona/severity and defaults the rest, mirroring the prior
 *  JSON.parse path. */
const BugReproSchema = z.object({
  browser: z.string().nullable(),
  route: z.string().nullable(),
  persona: z.string().nullable(),
  action: z.string().nullable(),
  expected: z.string().nullable(),
  actual: z.string().nullable(),
  severity: z.string().nullable(),
})

const URL_RE = /https?:\/\/[^\s]+/i
const ROUTE_RE = /\/(app|admin|api|owner|mechanic|aircraft|inbox|documents|work-orders)[/A-Za-z0-9_\-]*/i

function heuristic(ticketId: string, subject: string, body: string): BugRepro {
  const text = `${subject}\n${body}`
  const browserMatch = /(Chrome|Safari|Firefox|Edge|Opera)\/[\d.]+/i.exec(text)
  const routeMatch = URL_RE.exec(text)?.[0] ?? ROUTE_RE.exec(text)?.[0] ?? null
  const personaText = text.toLowerCase()
  const persona: BugRepro['persona'] = personaText.includes('mechanic')
    ? 'mechanic'
    : personaText.includes('admin')
      ? 'admin'
      : personaText.includes('owner')
        ? 'owner'
        : 'unknown'
  return {
    ticket_id: ticketId,
    browser: browserMatch?.[0] ?? null,
    route: routeMatch,
    persona,
    action: subject.slice(0, 200),
    expected: null,
    actual: null,
    severity: 'medium',
    source: 'heuristic',
  }
}

export async function triageBugTicket(args: {
  supabase: SupabaseClient
  ticketId: string
  subject: string
  body: string
}): Promise<{ ok: boolean; output?: BugRepro; runId?: string; error?: string }> {
  return runAgent<BugRepro>(
    'ux-help.bug-triage',
    {
      supabase: args.supabase,
      input: { ticket_id: args.ticketId },
      target: { kind: 'support_ticket', id: args.ticketId },
    },
    async (logger) => {
      // Cap body BEFORE running the injection guard or LLM. Anything past
      // ~4KB in a bug report is almost always pasted logs / attack payload.
      const cappedSubject = args.subject.slice(0, 240)
      const cappedBody = args.body.slice(0, MAX_BODY_CHARS)
      // Run the prompt-injection guard. On 'blocked', do NOT forward the
      // text to the LLM — fall back to the heuristic + tag the rec.
      const guardRes = await guardPromptInjection({
        supabase: args.supabase,
        text: `${cappedSubject}\n${cappedBody}`,
        source: { kind: 'support_ticket', id: args.ticketId },
      })
      const guardVerdict = guardRes.output?.verdict ?? 'safe'
      if (guardVerdict === 'blocked') {
        const repro = heuristic(args.ticketId, cappedSubject, cappedBody)
        return {
          output: repro,
          needsHuman: true,
          recommendation: {
            kind: 'bug_repro_drafted',
            repro,
            source: 'heuristic',
            prompt_injection_suspected: true,
            guard_score: guardRes.output?.score ?? 0,
          },
        }
      }

      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        const repro = heuristic(args.ticketId, cappedSubject, cappedBody)
        return {
          output: repro,
          needsHuman: true,
          recommendation: { kind: 'bug_repro_drafted', repro, source: 'heuristic' },
        }
      }
      try {
        logger.recordModel('openai', 'gpt-4o-mini')
        const result = await generateLlmObject({
          model: 'gpt-4o-mini',
          schema: BugReproSchema,
          temperature: 0,
          maxOutputTokens: 400,
          system:
            'Extract a structured bug reproduction from a user support ticket. Output STRICT JSON: {"browser":"...|null","route":"/path|null","persona":"owner|mechanic|admin|unknown","action":"...","expected":"...|null","actual":"...|null","severity":"low|medium|high|critical"}. Do not invent details — use null when unknown. Severity: low=cosmetic, medium=feature impaired, high=user blocked, critical=data loss / cross-tenant.',
          prompt: `SUBJECT:\n${cappedSubject}\n\nBODY:\n${cappedBody}`,
          abortSignal: AbortSignal.timeout(5000),
        })
        logger.recordTokens(result.usage.inputTokens, result.usage.outputTokens)
        const parsed = result.object as Partial<BugRepro>
        const persona: BugRepro['persona'] =
          parsed.persona === 'owner' ||
          parsed.persona === 'mechanic' ||
          parsed.persona === 'admin'
            ? parsed.persona
            : 'unknown'
        const severity: BugRepro['severity'] =
          parsed.severity === 'low' ||
          parsed.severity === 'medium' ||
          parsed.severity === 'high' ||
          parsed.severity === 'critical'
            ? parsed.severity
            : 'medium'
        const repro: BugRepro = {
          ticket_id: args.ticketId,
          browser: parsed.browser ?? null,
          route: parsed.route ?? null,
          persona,
          action: (parsed.action ?? cappedSubject).slice(0, 400),
          expected: parsed.expected ?? null,
          actual: parsed.actual ?? null,
          severity,
          source: 'llm',
        }
        return {
          output: repro,
          needsHuman: true,
          recommendation: {
            kind: 'bug_repro_drafted',
            repro,
            source: 'llm',
            guard_verdict: guardVerdict,
          },
        }
      } catch (err) {
        const fallback = heuristic(args.ticketId, cappedSubject, cappedBody)
        return {
          output: fallback,
          needsHuman: true,
          recommendation: {
            kind: 'bug_repro_drafted',
            repro: fallback,
            source: 'heuristic',
            llm_error: (err as Error).message.slice(0, 120),
          },
        }
      }
    },
  )
}
