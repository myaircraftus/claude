import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateLlmObject } from '@/lib/ai/llm'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { resolveRequestOrgContext } from '@/lib/auth/context'

const VALID_ENTRY_TYPES = [
  'maintenance',
  'annual',
  '100hr',
  'discrepancy',
  'ad_compliance',
  'sb_compliance',
  'component_replacement',
  'oil_change',
  'return_to_service',
  'major_repair',
  'major_alteration',
  'owner_preventive',
] as const

type DraftEntryType = (typeof VALID_ENTRY_TYPES)[number]

const SYSTEM_PROMPT = `You are assisting a human OCR reviewer for aircraft maintenance records.

Your job is to create a best-effort DRAFT from noisy OCR text and a small set of reviewer-selected keywords.

Rules:
- This is not a final canonical record. It is only a draft suggestion for a human reviewer.
- Use the selected keywords as the primary signal.
- Use the raw OCR text only to expand or connect those keywords into a plausible draft.
- If a value is unknown, return an empty string rather than inventing a precise value.
- work_description should be concise, technical, and obviously draft-quality.
- event_type must be one of: maintenance, annual, 100hr, discrepancy, ad_compliance, sb_compliance, component_replacement, oil_change, return_to_service, major_repair, major_alteration, owner_preventive.
- ad_references must be an array of strings.
- draft_notes should explain what was inferred versus directly supported by the keywords.

Return JSON only with:
{
  "event_type": string,
  "event_date": string,
  "tach_time": string,
  "work_description": string,
  "mechanic_name": string,
  "mechanic_cert_number": string,
  "ad_references": string[],
  "draft_notes": string
}`

function normalizeEntryType(value: unknown): DraftEntryType {
  if (typeof value === 'string' && (VALID_ENTRY_TYPES as readonly string[]).includes(value)) {
    return value as DraftEntryType
  }
  return 'maintenance'
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// Migrated to the unified AI SDK layer (lib/ai/llm).
// Permissive schema — the normalize* coercion below is unchanged.
const OcrDraftSchema = z.object({
  event_type: z.string().nullable(),
  event_date: z.string().nullable(),
  tach_time: z.string().nullable(),
  work_description: z.string().nullable(),
  mechanic_name: z.string().nullable(),
  mechanic_cert_number: z.string().nullable(),
  ad_references: z.array(z.string()).nullable(),
  draft_notes: z.string().nullable(),
})

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const rl = rateLimit(`ocr-review-draft:${ip}`, { limit: 20, windowSeconds: 60 })
  if (!rl.success) return rateLimitResponse(rl)

  const orgContext = await resolveRequestOrgContext(req)
  if (!orgContext) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const selectedKeywords = Array.isArray(body?.selected_keywords)
    ? body.selected_keywords.map((value: unknown) => normalizeString(value)).filter(Boolean).slice(0, 20)
    : []
  const candidateKeywords = Array.isArray(body?.candidate_keywords)
    ? body.candidate_keywords.map((value: unknown) => normalizeString(value)).filter(Boolean).slice(0, 30)
    : []
  const rawText = normalizeString(body?.raw_text)
  const documentTitle = normalizeString(body?.document_title)
  const pageClassification = normalizeString(body?.page_classification)
  const currentFields = body?.current_fields && typeof body.current_fields === 'object' ? body.current_fields : {}

  if (selectedKeywords.length === 0) {
    return NextResponse.json({ error: 'Select at least one keyword before using AI draft' }, { status: 400 })
  }

  const { object: parsed } = await generateLlmObject({
    model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
    schema: OcrDraftSchema,
    temperature: 0.2,
    maxOutputTokens: 900,
    system: SYSTEM_PROMPT,
    prompt: JSON.stringify({
      organization_id: orgContext.organizationId,
      document_title: documentTitle,
      page_classification: pageClassification,
      selected_keywords: selectedKeywords,
      candidate_keywords: candidateKeywords,
      current_fields: currentFields,
      raw_text: rawText,
    }),
  })

  return NextResponse.json({
    draft: {
      event_type: normalizeEntryType(parsed?.event_type),
      event_date: normalizeString(parsed?.event_date),
      tach_time: normalizeString(parsed?.tach_time),
      work_description: normalizeString(parsed?.work_description),
      mechanic_name: normalizeString(parsed?.mechanic_name),
      mechanic_cert_number: normalizeString(parsed?.mechanic_cert_number),
      ad_references: Array.isArray(parsed?.ad_references)
        ? parsed.ad_references.map((value: unknown) => normalizeString(value)).filter(Boolean)
        : [],
      draft_notes: normalizeString(parsed?.draft_notes),
    },
  })
}
