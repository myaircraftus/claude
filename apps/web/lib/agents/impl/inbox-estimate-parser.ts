/**
 * Inbox estimate parser. Reads a classified-as-estimate inbox message
 * and creates a draft `estimates` row (status='draft') the user can
 * approve from inside the app.
 *
 * Same pattern as the expense-extractor: cheap-LLM extraction, no
 * auto-action — always lands as draft, recommendation row fired for
 * human approval.
 */
import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface EstimateExtractOutput {
  vendor: string | null
  total: number | null
  currency: string
  valid_until: string | null
  description: string
  line_items: Array<{ desc: string; amount: number }>
  confidence: 'high' | 'medium' | 'low'
}

const SYSTEM_PROMPT = `You are myaircraft.us's estimate parser. Read the email/PDF and extract the structured estimate.

Return STRICT JSON:
{
  "vendor": "vendor name" | null,
  "total": numeric | null,
  "currency": "USD",
  "valid_until": "YYYY-MM-DD" | null,
  "description": "short human summary",
  "line_items": [ { "desc": "...", "amount": numeric } ... up to 10 ],
  "confidence": "high" | "medium" | "low"
}

If you can't read it clearly return confidence="low" and leave the fields null/empty. Never invent.`

export async function parseEstimateFromInbox(args: {
  supabase: SupabaseClient
  triggeredBy?: string | null
  messageId: string
  orgId: string | null
  userId: string
  subject: string | null
  body: string | null
  from: string
}): Promise<{ ok: boolean; output?: EstimateExtractOutput; runId?: string; error?: string }> {
  return runAgent<EstimateExtractOutput>(
    'inbox.estimate-parser',
    {
      supabase: args.supabase,
      triggeredBy: args.triggeredBy ?? null,
      target: { kind: 'inbox_message', id: args.messageId },
      input: { from: args.from, subject: args.subject?.slice(0, 200) ?? null },
    },
    async (logger) => {
      if (!process.env.OPENAI_API_KEY || !args.orgId) {
        return {
          output: {
            vendor: args.from.split('@')[1] ?? args.from,
            total: null,
            currency: 'USD',
            valid_until: null,
            description: args.subject ?? 'Inbox estimate',
            line_items: [],
            confidence: 'low',
          },
          needsHuman: true,
          recommendation: { kind: 'estimate_needs_review', reason: 'no_llm_or_org' },
        }
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      logger.recordModel('openai', 'gpt-4o')
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_INBOX_EXTRACTOR_MODEL || 'gpt-4o',
        temperature: 0,
        max_tokens: 800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              `From: ${args.from}`,
              `Subject: ${args.subject ?? '(no subject)'}`,
              '',
              'Body:',
              (args.body ?? '').slice(0, 6000),
              '',
              'Return JSON.',
            ].join('\n'),
          },
        ],
      })
      const usage = completion.usage
      if (usage) logger.recordTokens(usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0)

      let parsed: Partial<EstimateExtractOutput>
      try {
        parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Partial<EstimateExtractOutput>
      } catch {
        parsed = {}
      }
      const out: EstimateExtractOutput = {
        vendor: parsed.vendor ?? null,
        total: typeof parsed.total === 'number' && parsed.total > 0 ? parsed.total : null,
        currency: (parsed.currency ?? 'USD').toUpperCase(),
        valid_until:
          parsed.valid_until && /^\d{4}-\d{2}-\d{2}$/.test(parsed.valid_until)
            ? parsed.valid_until
            : null,
        description: (parsed.description ?? args.subject ?? 'Inbox estimate').slice(0, 280),
        line_items: Array.isArray(parsed.line_items)
          ? parsed.line_items
              .filter((li): li is { desc: string; amount: number } =>
                !!li && typeof li.desc === 'string' && typeof li.amount === 'number',
              )
              .slice(0, 10)
          : [],
        confidence: ['high', 'medium', 'low'].includes(parsed.confidence ?? '')
          ? (parsed.confidence as 'high' | 'medium' | 'low')
          : 'low',
      }

      const estimateNumber = `EST-INBOX-${Date.now().toString(36).toUpperCase()}`
      const { data: row, error: insertErr } = await args.supabase
        .from('estimates')
        .insert({
          organization_id: args.orgId,
          estimate_number: estimateNumber,
          status: 'draft',
          total: out.total ?? 0,
          customer_notes: out.description,
          created_by: args.userId,
        })
        .select('id')
        .single()

      if (!insertErr && row?.id) {
        await args.supabase
          .from('inbox_messages')
          .update({ related_estimate_id: row.id })
          .eq('id', args.messageId)
      }

      return {
        output: out,
        needsHuman: true,
        recommendation: {
          kind: 'estimate_needs_review',
          estimate_id: row?.id ?? null,
          confidence: out.confidence,
          inbox_message_id: args.messageId,
          line_items: out.line_items,
        },
      }
    },
  )
}
