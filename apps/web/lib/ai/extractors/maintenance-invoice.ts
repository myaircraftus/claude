/**
 * Maintenance-invoice extractor (Spec 7.3) — MX shop invoices with
 * labor + parts breakdown. Annual inspections, 100-hour, repair invoices.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { callAnthropic, type AnthropicAttachment } from '@/lib/ai/anthropic'
import { extractJsonObject } from './parse-json'
import { MaintenanceInvoiceSchema, type MaintenanceInvoice } from './schema'

const SYSTEM_PROMPT = `You are a maintenance-invoice extractor for an aviation cost-tracking platform.

You will be shown ONE shop invoice from an A&P / IA / repair station. Extract:
  - vendor (shop name)
  - vendor_address (single-line)
  - invoice_number (often "INV-1234" or "WO-2024-005")
  - date (YYYY-MM-DD — use invoice issue date)
  - total_amount (final total)
  - labor_total (sum of labor line items)
  - parts_total (sum of parts line items)
  - tax_amount
  - currency (default USD)
  - tail_number (the aircraft worked on)
  - service_type — pick ONE: "annual_inspection" | "100_hour" | "repair" | "other"
  - line_items[] with {description, amount, quantity?, unit_price?, category_hint?}
    where category_hint is "labor" / "parts" / "outside_service" / "tax" / "other"
  - notes (significant findings, deferred items, parts on order, etc.)
  - extraction_confidence (0-1)

OUTPUT FORMAT (strict)
Return ONLY a single JSON object. No markdown fences.

{
  "doc_kind": "maintenance-invoice",
  "vendor": "...", "vendor_address": null,
  "invoice_number": "...", "date": "YYYY-MM-DD",
  "total_amount": 0, "labor_total": 0, "parts_total": 0, "tax_amount": 0,
  "currency": "USD", "tail_number": null,
  "service_type": "annual_inspection",
  "line_items": [{ "description": "Replace #3 cylinder", "amount": 1400, "category_hint": "parts" }],
  "notes": null, "extraction_confidence": 0.0
}

HARD CONSTRAINTS
- All numbers are NUMBERS not strings. No $ prefix.
- If labor_total + parts_total + tax_amount differs from total_amount by more than $5, lower extraction_confidence to ≤0.5 and explain in notes.
- If you can't confidently classify service_type, default "other".
- Never invent FAR / AD / SB references not in the invoice.`

export async function extractMaintenanceInvoice(
  supabase: SupabaseClient,
  args: {
    organization_id: string
    intake_document_id: string
    attachment: AnthropicAttachment
    strict?: boolean
  },
): Promise<{ data: MaintenanceInvoice | null; raw: string; tokens: { input: number; output: number; cost_cents: number | null; duration_ms: number } }> {
  const userText = args.strict
    ? 'STRICT JSON only. Last attempt failed validation — re-emit per the schema in the system prompt.'
    : 'Extract this maintenance invoice. JSON only.'

  const result = await callAnthropic(
    supabase,
    {
      system: SYSTEM_PROMPT,
      user: userText,
      attachments: [args.attachment],
      max_tokens: 2500,
      temperature: 0.0,
      timeout_ms: 60_000,
    },
    {
      organization_id: args.organization_id,
      scope: 'extraction-maintenance-invoice',
      entity_kind: 'intake_documents',
      entity_id: args.intake_document_id,
      context: { mime: args.attachment.media_type, strict: !!args.strict },
    },
  )

  const json = extractJsonObject(result.text)
  const parsed = MaintenanceInvoiceSchema.safeParse(json)
  return {
    data: parsed.success ? parsed.data : null,
    raw: result.text,
    tokens: {
      input: result.input_tokens,
      output: result.output_tokens,
      cost_cents: result.cost_usd_cents,
      duration_ms: result.duration_ms,
    },
  }
}
