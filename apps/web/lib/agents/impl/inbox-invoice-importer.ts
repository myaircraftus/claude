/**
 * Inbox invoice importer. Reads a classified-as-invoice inbox message
 * and creates a draft `invoices` row (status='draft') the user can
 * approve from inside the app.
 *
 * Same pattern as the expense + estimate extractors: cheap-LLM
 * extraction, never auto-paid, always lands as draft with a
 * recommendation for human review.
 */
import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface InvoiceExtractOutput {
  vendor: string | null
  total: number | null
  currency: string
  invoice_date: string | null
  due_date: string | null
  invoice_number: string | null
  description: string
  confidence: 'high' | 'medium' | 'low'
}

const SYSTEM_PROMPT = `You are myaircraft.us's invoice importer. Read the email/PDF and extract the invoice header.

Return STRICT JSON:
{
  "vendor": "vendor name" | null,
  "total": numeric | null,
  "currency": "USD",
  "invoice_date": "YYYY-MM-DD" | null,
  "due_date": "YYYY-MM-DD" | null,
  "invoice_number": "string" | null,
  "description": "short human summary",
  "confidence": "high" | "medium" | "low"
}

If you can't read it clearly return confidence="low" and leave the fields null. Never invent.`

export async function importInvoiceFromInbox(args: {
  supabase: SupabaseClient
  triggeredBy?: string | null
  messageId: string
  orgId: string | null
  userId: string
  subject: string | null
  body: string | null
  from: string
}): Promise<{ ok: boolean; output?: InvoiceExtractOutput; runId?: string; error?: string }> {
  return runAgent<InvoiceExtractOutput>(
    'inbox.invoice-importer',
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
            invoice_date: null,
            due_date: null,
            invoice_number: null,
            description: args.subject ?? 'Inbox invoice',
            confidence: 'low',
          },
          needsHuman: true,
          recommendation: { kind: 'invoice_needs_review', reason: 'no_llm_or_org' },
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

      let parsed: Partial<InvoiceExtractOutput>
      try {
        parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Partial<InvoiceExtractOutput>
      } catch {
        parsed = {}
      }
      const out: InvoiceExtractOutput = {
        vendor: parsed.vendor ?? null,
        total: typeof parsed.total === 'number' && parsed.total > 0 ? parsed.total : null,
        currency: (parsed.currency ?? 'USD').toUpperCase(),
        invoice_date:
          parsed.invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.invoice_date)
            ? parsed.invoice_date
            : null,
        due_date:
          parsed.due_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date)
            ? parsed.due_date
            : null,
        invoice_number: parsed.invoice_number ?? null,
        description: (parsed.description ?? args.subject ?? 'Inbox invoice').slice(0, 280),
        confidence: ['high', 'medium', 'low'].includes(parsed.confidence ?? '')
          ? (parsed.confidence as 'high' | 'medium' | 'low')
          : 'low',
      }

      const invoiceNumber =
        out.invoice_number ?? `INV-INBOX-${Date.now().toString(36).toUpperCase()}`
      const { data: row, error: insertErr } = await args.supabase
        .from('invoices')
        .insert({
          organization_id: args.orgId,
          invoice_number: invoiceNumber,
          status: 'draft',
          total: out.total ?? 0,
          due_date: out.due_date,
          notes: out.description,
          created_by: args.userId,
        })
        .select('id')
        .single()

      if (!insertErr && row?.id) {
        await args.supabase
          .from('inbox_messages')
          .update({ related_invoice_id: row.id })
          .eq('id', args.messageId)
      }

      return {
        output: out,
        needsHuman: true,
        recommendation: {
          kind: 'invoice_needs_review',
          invoice_id: row?.id ?? null,
          confidence: out.confidence,
          inbox_message_id: args.messageId,
        },
      }
    },
  )
}
