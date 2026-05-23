/**
 * Support Triage agent — classifies an inbound ticket into:
 *   category: billing | how-to | bug | feature-request | outage | security | other
 *   severity: P0 | P1 | P2 | P3
 *
 * Runs chained after the first-responder so we can use the AI's own answer
 * as a strong signal for severity (an answer that hits "outage" terminology
 * is almost always P0). Cheap model — gpt-4o-mini — because the schema is
 * small and the upside of getting it wrong is bounded (a human still sees
 * the inbox).
 *
 * Output is persisted to support_tickets.category + severity, both columns
 * already on the table. Triage is best-effort: if the agent throws, the
 * ticket just keeps whatever defaults were set on insert (other / P3).
 */
import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export type TriageCategory =
  | 'billing'
  | 'how-to'
  | 'bug'
  | 'feature-request'
  | 'outage'
  | 'security'
  | 'other'
export type TriageSeverity = 'P0' | 'P1' | 'P2' | 'P3'

export interface TriageOutput {
  category: TriageCategory
  severity: TriageSeverity
  rationale: string
}

const SYSTEM_PROMPT = `You are myaircraft.us's ticket triage classifier.

Classify the incoming user message into:
  category: one of [billing, how-to, bug, feature-request, outage, security, other]
  severity: one of [P0, P1, P2, P3]

Severity guide:
- P0: production outage, security incident, data loss, billing failure blocking the user
- P1: major broken feature, can't complete a critical workflow
- P2: feature works but is confusing, intermittent bug, "how do I…" with frustration
- P3: simple how-to, feature suggestion, polish, comment

Return STRICT JSON: { "category": "...", "severity": "...", "rationale": "one sentence" }.`

const VALID_CATEGORIES: ReadonlySet<TriageCategory> = new Set([
  'billing',
  'how-to',
  'bug',
  'feature-request',
  'outage',
  'security',
  'other',
])
const VALID_SEVERITIES: ReadonlySet<TriageSeverity> = new Set(['P0', 'P1', 'P2', 'P3'])

export async function triageTicket(args: {
  supabase: SupabaseClient
  triggeredBy?: string | null
  ticketId: string
  question: string
  aiAnswer?: string | null
}): Promise<{ ok: boolean; output?: TriageOutput; runId?: string; error?: string }> {
  return runAgent<TriageOutput>(
    'support.triage',
    {
      supabase: args.supabase,
      triggeredBy: args.triggeredBy ?? null,
      target: { kind: 'support_ticket', id: args.ticketId },
      input: { question: args.question, has_ai_answer: !!args.aiAnswer },
    },
    async (logger) => {
      // Fast no-LLM fallback when key isn't configured — return safe defaults.
      if (!process.env.OPENAI_API_KEY) {
        const out: TriageOutput = {
          category: 'other',
          severity: 'P3',
          rationale: 'No OPENAI_API_KEY — defaulted to other/P3.',
        }
        await args.supabase
          .from('support_tickets')
          .update({ category: out.category, severity: out.severity })
          .eq('id', args.ticketId)
        return { output: out }
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      logger.recordModel('openai', 'gpt-4o-mini')
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_TRIAGE_MODEL || 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Ticket message:\n${args.question}\n\n${
              args.aiAnswer
                ? `Our AI first-responder said:\n${args.aiAnswer.slice(0, 1000)}\n`
                : ''
            }Return JSON.`,
          },
        ],
      })
      const usage = completion.usage
      if (usage) logger.recordTokens(usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0)

      let parsed: Partial<TriageOutput>
      try {
        parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Partial<TriageOutput>
      } catch {
        parsed = {}
      }

      const out: TriageOutput = {
        category: VALID_CATEGORIES.has(parsed.category as TriageCategory)
          ? (parsed.category as TriageCategory)
          : 'other',
        severity: VALID_SEVERITIES.has(parsed.severity as TriageSeverity)
          ? (parsed.severity as TriageSeverity)
          : 'P3',
        rationale: (parsed.rationale ?? '').toString().slice(0, 280),
      }

      // Map onto the support_ticket_category DB enum
      // {billing, technical, feature_request, bug, account, other}. The
      // agent's vocab is broader; outage/security collapse to bug,
      // how-to to technical, feature-request to feature_request.
      const dbCategory: 'billing' | 'technical' | 'feature_request' | 'bug' | 'account' | 'other' =
        out.category === 'billing'
          ? 'billing'
          : out.category === 'bug' || out.category === 'outage' || out.category === 'security'
          ? 'bug'
          : out.category === 'feature-request'
          ? 'feature_request'
          : out.category === 'how-to'
          ? 'technical'
          : 'other'

      // Persist directly to support_tickets — best-effort. If the row was
      // deleted between insert and now (shouldn't happen) we just no-op.
      await args.supabase
        .from('support_tickets')
        .update({ category: dbCategory, severity: out.severity })
        .eq('id', args.ticketId)

      return { output: out }
    },
  )
}
