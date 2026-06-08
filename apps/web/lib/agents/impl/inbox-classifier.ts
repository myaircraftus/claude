/**
 * Inbox classifier agent.
 *
 * Inputs:
 *   - One inbox_messages row (subject + body + attachment names)
 *
 * Output: one of
 *   receipt | estimate | invoice | reminder | adhoc | spam | other
 *
 * Writes the classification + confidence back onto the row. If
 * confidence >= 'medium' AND classification is receipt/estimate/invoice,
 * the caller may then fire the matching extractor agent.
 *
 * Cheap model (gpt-4o-mini) — schema is small, audit log handles the
 * rest of the bookkeeping.
 *
 * Migrated to the unified AI SDK layer (lib/ai/llm). Transport swapped from
 * raw `openai.chat.completions.create({ response_format: json_object })` to
 * `generateLlmObject`; the permissive schema + existing VALID_* coercion keep
 * the output behavior identical (invalid fields fall back, never throw).
 */
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'
import { generateLlmObject } from '@/lib/ai/llm'

export type InboxCategory =
  | 'receipt'
  | 'estimate'
  | 'invoice'
  | 'reminder'
  | 'adhoc'
  | 'spam'
  | 'other'
export type ClassifyConfidence = 'high' | 'medium' | 'low' | 'refused'

export interface InboxClassifyOutput {
  category: InboxCategory
  confidence: ClassifyConfidence
  rationale: string
}

const VALID_CATEGORIES: ReadonlySet<InboxCategory> = new Set([
  'receipt',
  'estimate',
  'invoice',
  'reminder',
  'adhoc',
  'spam',
  'other',
])
const VALID_CONFIDENCE: ReadonlySet<ClassifyConfidence> = new Set([
  'high',
  'medium',
  'low',
  'refused',
])

/** Permissive schema — model guidance comes from the prompt; the VALID_* sets
 *  below coerce anything off-spec, exactly as the prior JSON.parse path did. */
const ClassifySchema = z.object({
  category: z.string(),
  confidence: z.string(),
  rationale: z.string(),
})

const SYSTEM_PROMPT = `You are myaircraft.us's inbox classifier. You read one email or SMS and pick exactly one category:

- receipt: a vendor receipt for a purchase (fuel, parts, oil, supplies, services). Often a PDF/image attachment, total amount, vendor name.
- estimate: a quote from a vendor or shop. Has line items, a total, validity dates, "estimate" / "quote" wording.
- invoice: a bill due for payment. Has invoice number, due date, line items, total.
- reminder: an automated reminder (inspection due, AD compliance, regulatory deadline, payment reminder).
- adhoc: a person-to-person message (not a receipt/estimate/invoice/reminder).
- spam: marketing, phishing, unrelated.
- other: anything else.

Return STRICT JSON: { "category": "...", "confidence": "high" | "medium" | "low" | "refused", "rationale": "one sentence" }`

export async function classifyInboxMessage(args: {
  supabase: SupabaseClient
  triggeredBy?: string | null
  messageId: string
  from: string
  subject: string | null
  body: string | null
  attachmentNames: string[]
}): Promise<{
  ok: boolean
  output?: InboxClassifyOutput
  runId?: string
  error?: string
}> {
  return runAgent<InboxClassifyOutput>(
    'inbox.classifier',
    {
      supabase: args.supabase,
      triggeredBy: args.triggeredBy ?? null,
      target: { kind: 'inbox_message', id: args.messageId },
      input: {
        from: args.from,
        subject: args.subject?.slice(0, 200) ?? null,
        body_chars: args.body?.length ?? 0,
        attachment_count: args.attachmentNames.length,
      },
    },
    async (logger) => {
      // No-LLM fallback — heuristic on subject. Lets the system work in
      // dev / when the OpenAI key isn't set.
      if (!process.env.OPENAI_API_KEY) {
        const subj = (args.subject ?? '').toLowerCase()
        let category: InboxCategory = 'other'
        if (/receipt|paid|order confirm|thank you for your order/.test(subj)) {
          category = 'receipt'
        } else if (/estimate|quote/.test(subj)) {
          category = 'estimate'
        } else if (/invoice|bill|amount due/.test(subj)) {
          category = 'invoice'
        } else if (/reminder|due|expir/.test(subj)) {
          category = 'reminder'
        } else if (/\b(unsubscribe|sale|deal|offer)\b/.test(subj)) {
          category = 'spam'
        }
        const out: InboxClassifyOutput = {
          category,
          confidence: 'low',
          rationale: 'Heuristic — no OPENAI_API_KEY configured.',
        }
        await args.supabase
          .from('inbox_messages')
          .update({ classified_as: out.category, classify_confidence: out.confidence })
          .eq('id', args.messageId)
        return { output: out }
      }

      const model = process.env.OPENAI_INBOX_CLASSIFIER_MODEL || 'gpt-4o-mini'
      logger.recordModel('openai', model)
      const userPrompt = [
        `From: ${args.from}`,
        `Subject: ${args.subject ?? '(no subject)'}`,
        `Attachments: ${args.attachmentNames.length === 0 ? '(none)' : args.attachmentNames.join(', ')}`,
        '',
        'Body:',
        (args.body ?? '(empty)').slice(0, 4000),
        '',
        'Return JSON.',
      ].join('\n')

      const { object: parsed, usage } = await generateLlmObject({
        model,
        schema: ClassifySchema,
        temperature: 0,
        maxOutputTokens: 200,
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
      })
      logger.recordTokens(usage.inputTokens, usage.outputTokens)

      const out: InboxClassifyOutput = {
        category: VALID_CATEGORIES.has(parsed.category as InboxCategory)
          ? (parsed.category as InboxCategory)
          : 'other',
        confidence: VALID_CONFIDENCE.has(parsed.confidence as ClassifyConfidence)
          ? (parsed.confidence as ClassifyConfidence)
          : 'low',
        rationale: (parsed.rationale ?? '').toString().slice(0, 280),
      }

      await args.supabase
        .from('inbox_messages')
        .update({
          classified_as: out.category,
          classify_confidence: out.confidence,
        })
        .eq('id', args.messageId)

      return {
        output: out,
        // High-confidence receipt/estimate/invoice classifications are
        // immediately actionable — surface a recommendation so the
        // orchestrator (inbound webhook) can fire the right extractor.
        recommendation:
          (out.confidence === 'high' || out.confidence === 'medium') &&
          ['receipt', 'estimate', 'invoice'].includes(out.category)
            ? { kind: 'inbox_extract', extractor: `inbox.${out.category}-extractor` }
            : null,
      }
    },
  )
}
