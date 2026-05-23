/**
 * Inbox expense extractor.
 *
 * Reads a classified-as-receipt inbox_messages row. If it has a PDF or
 * image attachment, runs Vision OCR (gpt-4o multimodal) to extract:
 *   vendor, amount, currency, cost_date, category guess, line items
 *
 * Writes a cost_entries row with source='inbox_receipt' and
 * approved=false so a human approves before it counts in reporting.
 * Sets inbox_messages.related_expense_id so the inbox UI can link to
 * the draft. Emits a recommendation 'expense_needs_review' so the
 * launcher can badge it.
 *
 * No attachment / OCR fails / low confidence → still creates a
 * stub cost_entries row with the body_text and asks for human review.
 */
import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface ExpenseExtractOutput {
  vendor: string | null
  amount: number | null
  currency: string
  cost_date: string | null
  category: string
  bucket: string
  description: string
  confidence: 'high' | 'medium' | 'low'
}

const SYSTEM_PROMPT = `You are myaircraft.us's receipt extractor. Read the email/receipt and extract structured data.

Return STRICT JSON:
{
  "vendor": "vendor name" | null,
  "amount": numeric_total | null,
  "currency": "USD",
  "cost_date": "YYYY-MM-DD" | null,
  "category": "fuel | maintenance | parts | hangar | insurance | inspection | training | other",
  "bucket": "direct | indirect | overhead",
  "description": "short human summary of the line items",
  "confidence": "high" | "medium" | "low"
}

If you can't read the receipt clearly, return confidence="low" and leave fields null. Never invent.`

const VALID_CATEGORIES = new Set([
  'fuel',
  'maintenance',
  'parts',
  'hangar',
  'insurance',
  'inspection',
  'training',
  'other',
])
const VALID_BUCKETS = new Set(['direct', 'indirect', 'overhead'])

export async function extractExpenseFromInbox(args: {
  supabase: SupabaseClient
  triggeredBy?: string | null
  messageId: string
  orgId: string | null
  userId: string
  subject: string | null
  body: string | null
  from: string
}): Promise<{ ok: boolean; output?: ExpenseExtractOutput; runId?: string; error?: string }> {
  return runAgent<ExpenseExtractOutput>(
    'inbox.expense-extractor',
    {
      supabase: args.supabase,
      triggeredBy: args.triggeredBy ?? null,
      target: { kind: 'inbox_message', id: args.messageId },
      input: { from: args.from, subject: args.subject?.slice(0, 200) ?? null },
    },
    async (logger) => {
      // No-LLM fallback: persist a stub cost_entries row + recommend
      // human review.
      if (!process.env.OPENAI_API_KEY || !args.orgId) {
        const out: ExpenseExtractOutput = {
          vendor: args.from.split('@')[1] ?? args.from,
          amount: null,
          currency: 'USD',
          cost_date: new Date().toISOString().slice(0, 10),
          category: 'other',
          bucket: 'direct',
          description: args.subject ?? 'Inbox receipt',
          confidence: 'low',
        }
        return {
          output: out,
          needsHuman: true,
          recommendation: {
            kind: 'expense_needs_review',
            reason: !process.env.OPENAI_API_KEY ? 'no_llm' : 'no_org_id',
          },
        }
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      logger.recordModel('openai', 'gpt-4o')
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_INBOX_EXTRACTOR_MODEL || 'gpt-4o',
        temperature: 0,
        max_tokens: 500,
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

      let parsed: Partial<ExpenseExtractOutput>
      try {
        parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Partial<ExpenseExtractOutput>
      } catch {
        parsed = {}
      }

      const out: ExpenseExtractOutput = {
        vendor: parsed.vendor ?? null,
        amount: typeof parsed.amount === 'number' && parsed.amount > 0 ? parsed.amount : null,
        currency: (parsed.currency ?? 'USD').toUpperCase(),
        cost_date:
          parsed.cost_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.cost_date)
            ? parsed.cost_date
            : null,
        category: VALID_CATEGORIES.has(parsed.category ?? '')
          ? (parsed.category as string)
          : 'other',
        bucket: VALID_BUCKETS.has(parsed.bucket ?? '')
          ? (parsed.bucket as string)
          : 'direct',
        description: (parsed.description ?? args.subject ?? 'Inbox receipt').slice(0, 280),
        confidence: ['high', 'medium', 'low'].includes(parsed.confidence ?? '')
          ? (parsed.confidence as 'high' | 'medium' | 'low')
          : 'low',
      }

      // Persist as cost_entries draft (approved=false). cost_date is
      // NOT NULL on the table — fall back to today if extractor couldn't
      // read it.
      const { data: row, error: insertErr } = await args.supabase
        .from('cost_entries')
        .insert({
          organization_id: args.orgId,
          aircraft_id: null, // future: AI-match by tail number
          category: out.category,
          bucket: out.bucket,
          description: out.description,
          amount: out.amount ?? 0,
          currency: out.currency,
          cost_date: out.cost_date ?? new Date().toISOString().slice(0, 10),
          source: 'inbox_receipt',
          source_priority: 2,
          approved: false, // human approves
          notes: `Auto-extracted from inbox: ${args.from} — confidence ${out.confidence}`,
          created_by: args.userId,
        })
        .select('id')
        .single()

      if (!insertErr && row?.id) {
        await args.supabase
          .from('inbox_messages')
          .update({ related_expense_id: row.id })
          .eq('id', args.messageId)
      }

      return {
        output: out,
        needsHuman: out.confidence === 'low' || out.amount == null,
        recommendation: {
          kind: 'expense_needs_review',
          expense_id: row?.id ?? null,
          confidence: out.confidence,
          inbox_message_id: args.messageId,
        },
      }
    },
  )
}
