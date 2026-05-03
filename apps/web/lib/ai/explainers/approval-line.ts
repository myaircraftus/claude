/**
 * Approval line-item explainer (Spec 5.6) — server-only.
 *
 * Rewrites a technical line-item description into plain English the
 * customer can understand. Includes:
 *   - Why this matters (FAA / safety / cost framing)
 *   - What happens if deferred (when applicable)
 *   - Estimated turnaround (when known)
 *
 * The LLM is told NOT to invent costs, parts availability, or
 * regulatory citations it can't verify from the inputs. If a value
 * isn't in the input context, the explanation is shorter — that's
 * fine. Hallucination on a customer-facing surface is a hard fail.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { callAnthropic } from '../anthropic'

export interface ExplainArgs {
  organization_id: string
  user_id?: string | null
  /** approval_request id — entity anchor for ai_activity_log. */
  approval_request_id: string
  approval_line_item_id: string
  description: string
  estimated_cost: number
  labor_hours: number
  parts_cost: number
  /** Aircraft tail number (when known) so the explainer can reference
   *  "your Cessna 172" in the second person. */
  tail_number?: string | null
  aircraft_make_model?: string | null
}

export interface ExplainResult {
  explanation_md: string
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd_cents: number | null
}

const SYSTEM_PROMPT = `You are an A&P-aware aviation maintenance writer who translates technical work-order line items into plain English for aircraft owners.

GOAL
Rewrite ONE line item into a 2-4 sentence Markdown explanation an aircraft owner can read in 15 seconds and feel confident about approving (or knowing why to defer).

REQUIREMENTS
- Address the owner in second person ("your aircraft", "you").
- Explain WHY this work matters in safety and/or compliance terms when the description implies it.
- If the description names a measurement (compression, voltage, hours), reflect it back so the owner sees the evidence.
- Keep it specific — no marketing fluff. Don't pad sentences.
- Output Markdown. Use a single short paragraph; one bold lead clause is fine if it sharpens the safety framing.

HARD CONSTRAINTS
- Do NOT invent regulations, FAR numbers, AD numbers, part numbers, or turnaround times that aren't in the input.
- Do NOT promise outcomes ("guaranteed", "will eliminate"). Use measured language.
- Do NOT criticize the operator or another shop.
- Do NOT include the cost in the explanation — it's shown separately on the page.
- If the input is too sparse to explain meaningfully (e.g. just "Misc parts $20"), keep your output short and factual instead of inventing context.

OUTPUT FORMAT
Just the Markdown body. No headings, no preamble, no "Here's the explanation:".`

export async function explainApprovalLine(
  supabase: SupabaseClient,
  args: ExplainArgs,
): Promise<ExplainResult> {
  const userPrompt = buildUserPrompt(args)

  const result = await callAnthropic(
    supabase,
    {
      system: SYSTEM_PROMPT,
      user: userPrompt,
      max_tokens: 400,
      temperature: 0.4,
    },
    {
      organization_id: args.organization_id,
      user_id: args.user_id ?? null,
      scope: 'approval-line-explainer',
      entity_kind: 'approval_line_items',
      entity_id: args.approval_line_item_id,
      context: {
        approval_request_id: args.approval_request_id,
        // Don't log full description — keep short fingerprint for cost
        // attribution without storing customer-facing text.
        description_length: args.description.length,
        has_tail: !!args.tail_number,
      },
    },
  )

  return {
    explanation_md: result.text,
    model: result.model,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    cost_usd_cents: result.cost_usd_cents,
  }
}

function buildUserPrompt(a: ExplainArgs): string {
  const aircraftLabel = a.tail_number
    ? a.aircraft_make_model
      ? `your ${a.aircraft_make_model} (${a.tail_number})`
      : `your aircraft (${a.tail_number})`
    : 'your aircraft'

  return [
    `Aircraft context: ${aircraftLabel}.`,
    `Operator's line-item description: """${a.description}"""`,
    `Labor hours: ${a.labor_hours.toFixed(1)} hr`,
    `Parts cost (USD): ${a.parts_cost.toFixed(2)}`,
    `Total estimated cost (USD): ${a.estimated_cost.toFixed(2)} (do not include in your output)`,
    '',
    'Now write the plain-English explanation per the rules in your system prompt.',
  ].join('\n')
}

/* ─── Customer-side "Ask a question" ────────────────────────────────── */

const ASK_SYSTEM_PROMPT = `You are an aviation maintenance customer-service AI answering questions about a specific approval request the customer just received.

INPUTS YOU GET
- The list of line items on the approval (description, hours, parts, total)
- The aircraft tail/make/model (when known)
- The customer's question

GOAL
Answer in 2-3 sentences. Plain English. Honest. If you don't know, say so and suggest the customer reach out to the shop directly.

HARD CONSTRAINTS
- Stay grounded in the inputs you were given. Do NOT invent regulations, FAR numbers, part numbers, turnaround times, or shop policies that aren't in the inputs.
- Do NOT criticize the shop or another mechanic.
- Do NOT promise outcomes.
- If the question asks for a discount or payment terms, redirect: "I can't change pricing — please reach out to the shop directly."
- If the question is off-topic (legal advice, medical, stock tips), politely decline and redirect.`

export interface AskArgs {
  organization_id: string
  approval_request_id: string
  question: string
  line_items: Array<{
    description: string
    estimated_cost: number
    labor_hours: number
    parts_cost: number
  }>
  tail_number?: string | null
  aircraft_make_model?: string | null
}

export interface AskResult {
  answer_md: string
  model: string
  input_tokens: number
  output_tokens: number
}

export async function answerCustomerQuestion(
  supabase: SupabaseClient,
  args: AskArgs,
): Promise<AskResult> {
  const userPrompt = buildAskUserPrompt(args)

  const result = await callAnthropic(
    supabase,
    {
      system: ASK_SYSTEM_PROMPT,
      user: userPrompt,
      max_tokens: 500,
      temperature: 0.3,
    },
    {
      organization_id: args.organization_id,
      // Customer is anonymous (token auth) — no user_id.
      user_id: null,
      scope: 'approval-customer-ask',
      entity_kind: 'approval_requests',
      entity_id: args.approval_request_id,
      context: {
        question_length: args.question.length,
        line_count: args.line_items.length,
      },
    },
  )

  return {
    answer_md: result.text,
    model: result.model,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
  }
}

function buildAskUserPrompt(a: AskArgs): string {
  const aircraftLabel = a.tail_number
    ? a.aircraft_make_model
      ? `${a.aircraft_make_model} (${a.tail_number})`
      : a.tail_number
    : 'the aircraft'

  const lines = a.line_items
    .map(
      (li, i) =>
        `${i + 1}. ${li.description} — ${li.labor_hours.toFixed(1)} hr labor + $${li.parts_cost.toFixed(2)} parts = $${li.estimated_cost.toFixed(2)}`,
    )
    .join('\n')

  return [
    `Aircraft: ${aircraftLabel}.`,
    `Approval line items:`,
    lines,
    '',
    `Customer's question: "${a.question.trim()}"`,
    '',
    'Answer per the rules in your system prompt.',
  ].join('\n')
}
