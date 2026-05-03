/**
 * Cost-receipt extractor (Spec 7.3) — fuel / oil / parts receipts.
 *
 * Returns a CostReceipt object validated against schema.ts. Caller
 * (extract orchestrator in /api/costs/intake/[id]/extract) handles
 * retries + fallback to manual_review_needed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { callAnthropic, type AnthropicAttachment } from '@/lib/ai/anthropic'
import { extractJsonObject } from './parse-json'
import { CostReceiptSchema, type CostReceipt } from './schema'

const SYSTEM_PROMPT = `You are a receipt-extraction AI for an aviation cost-tracking platform.

You will be shown ONE receipt or invoice image/PDF. Extract:
  - vendor (the merchant — "Shell", "Aircraft Spruce", "FBO Self-Serve", etc.)
  - vendor_address (when visible — full single-line string)
  - date (YYYY-MM-DD; if year missing, use the most recent plausible year)
  - total_amount (the final total the customer paid, after tax)
  - currency (3-letter ISO; default USD if unclear)
  - tail_number (US "N12345" / Canadian "C-FXYZ" / European "G-ABCD" — leave null if not visible)
  - line_items[] with {description, amount, quantity?, unit_price?, category_hint?}
  - notes (anything unusual: "tendered card ending 4111", "split bill", etc.)
  - extraction_confidence (0-1 self-rating)

Category hint examples for line_items[].category_hint: "fuel", "oil", "parts", "tax", "tip", "other".

OUTPUT FORMAT (strict)
Return ONLY a single JSON object. No markdown fences. No preamble. No trailing commentary.

{
  "doc_kind": "cost-receipt",
  "vendor": "...",
  "vendor_address": null,
  "date": "YYYY-MM-DD",
  "total_amount": 0.00,
  "currency": "USD",
  "tail_number": null,
  "line_items": [{ "description": "...", "amount": 0.00 }],
  "notes": null,
  "extraction_confidence": 0.0
}

HARD CONSTRAINTS
- If a field is unclear, use null. Never invent.
- amounts are NUMBERS, not strings. No "$" prefix.
- date is ISO YYYY-MM-DD. If only month+day visible, leave null.
- line_items must sum to total_amount within $1, OR the model must lower extraction_confidence to ≤0.5 and add a note explaining the discrepancy.`

export async function extractCostReceipt(
  supabase: SupabaseClient,
  args: {
    organization_id: string
    intake_document_id: string
    attachment: AnthropicAttachment
    /** Set to true on the second (retry) call to use a stricter prompt. */
    strict?: boolean
  },
): Promise<{ data: CostReceipt | null; raw: string; tokens: { input: number; output: number; cost_cents: number | null; duration_ms: number } }> {
  const userText = args.strict
    ? 'Extract this receipt as STRICT JSON. Last attempt failed schema validation — review the schema in your system prompt and emit ONLY the JSON object, no fences, no explanation.'
    : 'Extract this receipt. Output JSON only.'

  const result = await callAnthropic(
    supabase,
    {
      system: SYSTEM_PROMPT,
      user: userText,
      attachments: [args.attachment],
      max_tokens: 1500,
      temperature: 0.0,
      timeout_ms: 60_000,
    },
    {
      organization_id: args.organization_id,
      scope: 'extraction-cost-receipt',
      entity_kind: 'intake_documents',
      entity_id: args.intake_document_id,
      context: { mime: args.attachment.media_type, strict: !!args.strict },
    },
  )

  const json = extractJsonObject(result.text)
  const parsed = CostReceiptSchema.safeParse(json)
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
