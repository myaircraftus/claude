/**
 * Document router (Spec 7.3) — classifies an intake_document into one
 * of the specialist extractors before the heavy extraction call.
 *
 * Why a separate classify pass:
 *   - Smaller token budget (max 200 output) than the specialists
 *   - Fast fail-out if the doc isn't aircraft-related at all
 *   - One Claude call per intake to keep cost predictable
 *
 * Returns a RouterClassification — `unknown` means "skip extraction,
 * mark intake as rejected for manual review."
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { callAnthropic, type AnthropicAttachment } from '@/lib/ai/anthropic'
import { extractJsonObject } from './parse-json'
import { RouterClassificationSchema, type RouterClassification } from './schema'

const SYSTEM_PROMPT = `You are a document classifier for an aviation maintenance platform's cost-intake pipeline.

You will be shown ONE document image or PDF. Classify it into exactly one of:

  cost-receipt           — fuel/oil/parts retail receipts (gas station, FBO self-serve, Aircraft Spruce, AeroShell, Walmart, etc.)
  maintenance-invoice    — shop invoice with labor + parts (annual inspection, 100-hour, repair, AD compliance)
  insurance-declaration  — annual aviation insurance policy declaration page (Avemco, AIG, Old Republic, USAIG, etc.)
  unknown                — anything else (bills unrelated to aircraft, blank pages, photos of the cockpit, advertisements)

Output ONLY a single JSON object on the form:
{"doc_kind":"<one-of-the-four>","confidence":<0-1>,"reason":"<short string>"}

No markdown fences. No commentary before or after the JSON.`

export async function classifyDocument(
  supabase: SupabaseClient,
  args: {
    organization_id: string
    intake_document_id: string
    attachment: AnthropicAttachment
  },
): Promise<RouterClassification> {
  const result = await callAnthropic(
    supabase,
    {
      system: SYSTEM_PROMPT,
      user: 'Classify this document. Output JSON only.',
      attachments: [args.attachment],
      max_tokens: 200,
      temperature: 0.0,
      timeout_ms: 60_000,
    },
    {
      organization_id: args.organization_id,
      scope: 'extraction-router',
      entity_kind: 'intake_documents',
      entity_id: args.intake_document_id,
      context: { mime: args.attachment.media_type },
    },
  )

  const json = extractJsonObject(result.text)
  const parsed = RouterClassificationSchema.safeParse(json)
  if (!parsed.success) {
    return { doc_kind: 'unknown', confidence: 0, reason: 'router-schema-mismatch' }
  }
  return parsed.data
}
