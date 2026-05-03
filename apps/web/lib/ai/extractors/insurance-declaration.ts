/**
 * Insurance-declaration extractor (Spec 7.3) — annual aviation policy
 * declaration page. Premium + coverage limits + policy period.
 *
 * Output drives one cost_entries row in bucket='annual_fixed' for the
 * premium, plus the policy_period_* columns are surfaced on the
 * intake detail page so the operator can verify coverage matches.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { callAnthropic, type AnthropicAttachment } from '@/lib/ai/anthropic'
import { extractJsonObject } from './parse-json'
import { InsuranceDeclarationSchema, type InsuranceDeclaration } from './schema'

const SYSTEM_PROMPT = `You are an insurance-document extractor for an aviation cost-tracking platform.

You will be shown ONE aviation insurance declaration page (Avemco / AIG / Old Republic / USAIG / etc.). Extract:
  - carrier (insurance company name)
  - policy_number
  - annual_premium (the headline annual cost)
  - hull_value (combined ground + flight, USD)
  - liability_limit (per-occurrence, USD)
  - policy_period_start / policy_period_end (YYYY-MM-DD)
  - currency (default USD)
  - tail_number
  - insured_name (the named insured — operator or owner)
  - notes (deductibles, named pilots, restrictions worth flagging)
  - extraction_confidence (0-1)

OUTPUT FORMAT (strict)
Return ONLY a single JSON object. No markdown fences.

{
  "doc_kind": "insurance-declaration",
  "carrier": "...", "policy_number": "...",
  "annual_premium": 0, "hull_value": 0, "liability_limit": 0,
  "policy_period_start": "YYYY-MM-DD", "policy_period_end": "YYYY-MM-DD",
  "currency": "USD", "tail_number": null, "insured_name": null,
  "notes": null, "extraction_confidence": 0.0
}

HARD CONSTRAINTS
- All amounts are NUMBERS not strings. No $ prefix, no "1.5 million" — write 1500000.
- If the doc is a quote (not yet bound) rather than a declaration, lower extraction_confidence to ≤0.5 and add a note.
- Never invent regulations, ratings, or pilot endorsements not in the document.`

export async function extractInsuranceDeclaration(
  supabase: SupabaseClient,
  args: {
    organization_id: string
    intake_document_id: string
    attachment: AnthropicAttachment
    strict?: boolean
  },
): Promise<{ data: InsuranceDeclaration | null; raw: string; tokens: { input: number; output: number; cost_cents: number | null; duration_ms: number } }> {
  const userText = args.strict
    ? 'STRICT JSON only. Last attempt failed validation.'
    : 'Extract this insurance declaration. JSON only.'

  const result = await callAnthropic(
    supabase,
    {
      system: SYSTEM_PROMPT,
      user: userText,
      attachments: [args.attachment],
      max_tokens: 1200,
      temperature: 0.0,
      timeout_ms: 60_000,
    },
    {
      organization_id: args.organization_id,
      scope: 'extraction-insurance-declaration',
      entity_kind: 'intake_documents',
      entity_id: args.intake_document_id,
      context: { mime: args.attachment.media_type, strict: !!args.strict },
    },
  )

  const json = extractJsonObject(result.text)
  const parsed = InsuranceDeclarationSchema.safeParse(json)
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
