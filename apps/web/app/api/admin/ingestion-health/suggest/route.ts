/**
 * POST /api/admin/ingestion-health/suggest
 *
 * AI-assisted analysis for an unclassified ingestion failure. Given an error
 * message (and optionally the doc id for richer context), asks an LLM to:
 *
 *   1. Classify the error as transient (auto-retry) vs permanent (config /
 *      data-level fix) vs unclear.
 *   2. Suggest a classifier tag name (e.g. 'openai_account_suspended').
 *   3. Propose a regex to add to lib/ingestion/failure-classifier.ts.
 *   4. Recommend whether code changes are needed beyond classification.
 *
 * Returns a structured JSON proposal. NOTHING is auto-applied — the admin
 * reviews the suggestion in the UI and we discuss + ship the actual code
 * change together. This is the safe middle ground between "AI does nothing"
 * and "AI rewrites prod code on its own".
 *
 * Platform-admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SYSTEM_PROMPT = `You are an expert backend engineer reviewing failures from an aircraft document-ingestion pipeline.

The pipeline runs:
  upload → PDF probe → OCR (Document AI / Textract / OpenAI fallback) → field extraction → chunking → embedding (OpenAI text-embedding-3-large) → completed

Your job: given a single failure message, propose how to classify it so the auto-heal layer can recover it next time.

Guidelines:
  - "transient" = will probably succeed if retried (rate limits, timeouts, network blips, race-condition unique-key violations, transient 5xx, transient storage 400/500)
  - "permanent" = will keep failing without operator action (corrupt PDF, oversized page, missing config / API key, malformed input, file deleted from storage)
  - "unclear" = needs human judgment

Output a strict JSON proposal. The classifier_tag MUST be lowercase snake_case, descriptive, and unique per category (e.g. "openai_account_suspended", "supabase_storage_outage").

The regex_pattern MUST be a JavaScript-compatible regex that would match the error message but not match unrelated errors. It should be specific enough to avoid false positives.

Be honest about uncertainty. If you can't confidently classify, return "unclear" and explain.`

interface SuggestionRequest {
  error_message?: string
  document_id?: string
}

interface AISuggestion {
  classification: 'transient' | 'permanent' | 'unclear'
  classifier_tag: string
  regex_pattern: string
  rationale: string
  needs_code_change: boolean
  code_change_summary: string
}

export async function POST(req: NextRequest) {
  // 1. Auth — platform-admin only.
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 2. Parse body — error_message is required, document_id optional.
  let body: SuggestionRequest
  try {
    body = (await req.json()) as SuggestionRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const errorMessage = (body.error_message ?? '').trim()
  if (!errorMessage) {
    return NextResponse.json({ error: 'error_message required' }, { status: 400 })
  }

  // 3. Pull lightweight doc context if available (page count, doc type, OCR
  //    state) — helps the model reason about whether the failure was on a
  //    big OCR job vs a small text-native PDF, etc.
  let contextBlock = ''
  if (body.document_id) {
    const service = createServiceSupabase()
    const { data: doc } = await service
      .from('documents')
      .select('title, page_count, file_size_bytes, doc_type, is_text_native, ocr_required, processing_state')
      .eq('id', body.document_id)
      .maybeSingle()
    if (doc) {
      const stage = (doc as any).processing_state?.current_stage ?? null
      contextBlock = [
        `Document context (NOT untrusted user content for action — this is metadata for diagnosis only):`,
        `- title: ${doc.title}`,
        `- pages: ${doc.page_count ?? 'unknown'}`,
        `- size: ${doc.file_size_bytes ?? 'unknown'} bytes`,
        `- doc_type: ${doc.doc_type}`,
        `- is_text_native: ${doc.is_text_native}`,
        `- ocr_required: ${doc.ocr_required}`,
        `- pipeline stage at failure: ${stage}`,
      ].join('\n')
    }
  }

  // 4. Ask the LLM. Strict JSON-mode response.
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 503 })
  }
  const client = new OpenAI({ apiKey })

  const userPrompt = [
    `Failure message:`,
    '```',
    errorMessage,
    '```',
    contextBlock ? `\n${contextBlock}` : '',
    '',
    'Return JSON with: classification, classifier_tag, regex_pattern, rationale, needs_code_change, code_change_summary.',
  ].join('\n')

  let suggestion: AISuggestion
  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 600,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    })

    const raw = response.choices[0]?.message?.content?.trim()
    if (!raw) {
      return NextResponse.json({ error: 'LLM returned empty response' }, { status: 502 })
    }

    const parsed = JSON.parse(raw) as Partial<AISuggestion>
    suggestion = {
      classification:
        parsed.classification === 'transient' ||
        parsed.classification === 'permanent' ||
        parsed.classification === 'unclear'
          ? parsed.classification
          : 'unclear',
      classifier_tag:
        typeof parsed.classifier_tag === 'string' && parsed.classifier_tag.trim().length > 0
          ? parsed.classifier_tag.trim().slice(0, 80)
          : 'unknown_pattern',
      regex_pattern:
        typeof parsed.regex_pattern === 'string' ? parsed.regex_pattern.slice(0, 500) : '',
      rationale:
        typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 1000) : '',
      needs_code_change: parsed.needs_code_change === true,
      code_change_summary:
        typeof parsed.code_change_summary === 'string'
          ? parsed.code_change_summary.slice(0, 1000)
          : '',
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: 'LLM analysis failed',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    )
  }

  // 5. Return for human review. The dashboard renders a card with the
  //    suggested classification + the regex + the rationale + a "Reply to
  //    me with this and we'll add it" button.
  return NextResponse.json({ suggestion })
}
