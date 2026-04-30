/**
 * POST /api/admin/ingestion-health/suggest
 *
 * Smart-by-default analysis for an ingestion failure:
 *
 *   1. If the error is already classified as a KNOWN tag (openai_429,
 *      duplicate_key_pages, postgres_statement_timeout, etc.), we skip the
 *      LLM entirely and return a canned, hand-curated explanation that
 *      includes:
 *        - what the error means
 *        - what the auto-heal layer is already doing about it
 *        - whether the operator actually needs to do anything
 *      This avoids spending OpenAI quota on errors we already understand,
 *      and gives a useful answer even when OpenAI itself is at quota
 *      (chicken-and-egg: if all your failures are openai_429, the LLM is
 *      probably also out of quota).
 *
 *   2. If the error is 'unknown' (no classifier match), we ask the LLM to
 *      propose a classification + regex + rationale. NOTHING is auto-
 *      applied. The dashboard renders the suggestion in a card for human
 *      review. If the LLM call itself fails (e.g. OpenAI 429), we return
 *      a clear actionable message instead of a generic "LLM analysis
 *      failed".
 *
 * Platform-admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { classifyIngestionFailure } from '@/lib/ingestion/failure-classifier'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface AISuggestion {
  classification: 'transient' | 'permanent' | 'unclear'
  classifier_tag: string
  regex_pattern: string
  rationale: string
  needs_code_change: boolean
  code_change_summary: string
  /** True when this came from the local catalog (no LLM call). */
  from_local_catalog?: boolean
}

// Hand-curated explanations for the failure tags our classifier already
// knows about. Returned instantly without burning an LLM call.
const KNOWN_TAG_EXPLANATIONS: Record<
  string,
  Omit<AISuggestion, 'from_local_catalog'>
> = {
  openai_429: {
    classification: 'transient',
    classifier_tag: 'openai_429',
    regex_pattern: '/(429|quota|rate[- ]?limit)/i',
    rationale:
      "OpenAI's API is throttling you (rate limit) or your account is at its quota. Already classified as transient — the embeddings layer retries each batch up to 6 times with exponential backoff (5s → 15s → 45s → 90s → 180s, capped at 5 min). The cron healer also auto-retries any 'failed' rows with this tag every 5 min, up to 4 attempts.",
    needs_code_change: false,
    code_change_summary:
      "No code change needed. If you're seeing many 429s in a short window, your OpenAI account is at its per-minute quota — top up the account at https://platform.openai.com/account/billing or wait a few minutes. Recovery is automatic.",
  },
  openai_5xx: {
    classification: 'transient',
    classifier_tag: 'openai_5xx',
    regex_pattern: '/OpenAI.* (5\\d\\d|service unavailable)/i',
    rationale:
      'OpenAI service-side error. Auto-retried with backoff. Usually clears within seconds.',
    needs_code_change: false,
    code_change_summary: 'No action needed — auto-retry handles it.',
  },
  openai_annotation_timeout: {
    classification: 'transient',
    classifier_tag: 'openai_annotation_timeout',
    regex_pattern: '/OpenAI OCR annotation timed out/i',
    rationale:
      "The OpenAI structured-field annotation step timed out. As of the last fix this is best-effort — a timeout no longer fails the doc, the chunks/embeddings still get created, just without the AI-extracted structured fields. If you're seeing this tag with outcome='failed', the ingestion happened BEFORE the best-effort fix landed.",
    needs_code_change: false,
    code_change_summary:
      'No code change needed — the fix already shipped. Old failed rows can be force-retried; new ones are best-effort.',
  },
  duplicate_key_pages: {
    classification: 'transient',
    classifier_tag: 'duplicate_key_pages',
    regex_pattern: '/duplicate key value .* document_pages/i',
    rationale:
      'A retry raced a still-running prior attempt and tried to insert the same (document_id, page_number) row. As of the last fix, document_pages writes use upsert with onConflict so the second writer wins idempotently — this should not happen anymore on freshly-uploaded docs.',
    needs_code_change: false,
    code_change_summary:
      'No code change needed — the fix already shipped. Old failed rows are recoverable via the retry button or auto-heal.',
  },
  duplicate_key_ocr_jobs: {
    classification: 'transient',
    classifier_tag: 'duplicate_key_ocr_jobs',
    regex_pattern: '/duplicate key value .* ocr_page_jobs/i',
    rationale:
      'Same race as duplicate_key_pages but on the ocr_page_jobs table. Fixed in the same commit by switching to upsert(onConflict="document_id,page_number").',
    needs_code_change: false,
    code_change_summary: 'No code change needed — the fix already shipped.',
  },
  duplicate_key_other: {
    classification: 'transient',
    classifier_tag: 'duplicate_key_other',
    regex_pattern: '/duplicate key value/i',
    rationale:
      'Two concurrent writers collided on a unique index. Auto-retried. Worth investigating which table is hitting it (the error message will name the constraint) — if it is a recurring spot we should switch that insert to an upsert.',
    needs_code_change: false,
    code_change_summary:
      'Inspect the constraint name in the error message; if it recurs, switch the insert to upsert(onConflict=...).',
  },
  postgres_statement_timeout: {
    classification: 'transient',
    classifier_tag: 'postgres_statement_timeout',
    regex_pattern: '/canceling statement due to statement timeout/i',
    rationale:
      'A Postgres statement hit the per-statement timeout. The big-doc cleanup path is now ALTER FUNCTION SET statement_timeout=180s so this should be rare. Auto-retried by the heal layer.',
    needs_code_change: false,
    code_change_summary: 'No action needed — auto-retry handles it.',
  },
  cleanup_ocr_segments_timeout: {
    classification: 'transient',
    classifier_tag: 'cleanup_ocr_segments_timeout',
    regex_pattern: '/Failed to clear OCR entry segments/i',
    rationale:
      'OCR-segment cleanup hit the per-statement timeout. Fixed via the clear_document_derived_artifacts RPC that does the cleanup in one transaction with a 180s timeout budget. Auto-retried.',
    needs_code_change: false,
    code_change_summary: 'No action needed — auto-retry handles it.',
  },
  cleanup_chunks_timeout: {
    classification: 'transient',
    classifier_tag: 'cleanup_chunks_timeout',
    regex_pattern: '/Failed to clear document chunks/i',
    rationale:
      'Chunk cleanup hit the per-statement timeout. Same fix as cleanup_ocr_segments_timeout. Auto-retried.',
    needs_code_change: false,
    code_change_summary: 'No action needed — auto-retry handles it.',
  },
  pdf_download_400: {
    classification: 'transient',
    classifier_tag: 'pdf_download_400',
    regex_pattern: '/Failed to download PDF .* 400/',
    rationale:
      "Supabase storage returned a transient 400 on the signed URL. downloadPdfBytes() now retries 4× with linear backoff so this rarely propagates anymore. If you're seeing it, the doc was ingested before that fix.",
    needs_code_change: false,
    code_change_summary: 'No action needed — auto-retry handles it.',
  },
  pdf_download_5xx: {
    classification: 'transient',
    classifier_tag: 'pdf_download_5xx',
    regex_pattern: '/Failed to download PDF .* 5\\d\\d/',
    rationale: 'Storage 5xx — auto-retried.',
    needs_code_change: false,
    code_change_summary: 'No action needed — auto-retry handles it.',
  },
  pdf_download_404: {
    classification: 'permanent',
    classifier_tag: 'pdf_download_404',
    regex_pattern: '/Failed to download PDF .* 404/',
    rationale:
      'The PDF file is missing from Supabase storage. This is permanent — the bytes are gone. Re-upload required.',
    needs_code_change: false,
    code_change_summary: 'Operator action: ask the customer to re-upload that file.',
  },
  pdf_download_403: {
    classification: 'permanent',
    classifier_tag: 'pdf_download_403',
    regex_pattern: '/Failed to download PDF .* 403/',
    rationale: 'Storage credentials issue. Permanent until env vars are fixed.',
    needs_code_change: true,
    code_change_summary: 'Check SUPABASE_SERVICE_ROLE_KEY and storage bucket policies.',
  },
  network_econnreset: {
    classification: 'transient',
    classifier_tag: 'network_econnreset',
    regex_pattern: '/(ECONNRESET|ETIMEDOUT|EAI_AGAIN)/',
    rationale: 'Transient network blip during an external API call. Auto-retried.',
    needs_code_change: false,
    code_change_summary: 'No action needed — auto-retry handles it.',
  },
  gateway_timeout: {
    classification: 'transient',
    classifier_tag: 'gateway_timeout',
    regex_pattern: '/(503|504|gateway timeout)/i',
    rationale: 'Upstream gateway timeout. Auto-retried.',
    needs_code_change: false,
    code_change_summary: 'No action needed — auto-retry handles it.',
  },
  function_timeout: {
    classification: 'transient',
    classifier_tag: 'function_timeout',
    regex_pattern: '/(timed out|timeout)/i',
    rationale:
      'A pipeline step hit its timeout. Auto-retried. If you see this tag piling up for big docs, the next-level fix is to push that doc to a background job queue.',
    needs_code_change: false,
    code_change_summary: 'No action needed for individual occurrences.',
  },
  ocr_not_configured: {
    classification: 'permanent',
    classifier_tag: 'ocr_not_configured',
    regex_pattern: '/OCR engine is not configured|OcrNotConfiguredError/i',
    rationale:
      'No OCR backend is configured. This is a config issue, not a transient failure.',
    needs_code_change: true,
    code_change_summary:
      'Add at least one of: OPENAI_API_KEY (already set normally), GOOGLE_DOCUMENT_AI_* env vars, or AWS Textract keys.',
  },
  pdf_oversize: {
    classification: 'permanent',
    classifier_tag: 'pdf_oversize',
    regex_pattern: '/(exceeds the maximum|object size)/i',
    rationale:
      'A single PDF page exceeds Document AI online-mode size limits. The file would need to be split.',
    needs_code_change: true,
    code_change_summary:
      "Either pre-split very large PDF pages on the client, or fall back to Document AI batch mode for these docs.",
  },
  pdf_structure: {
    classification: 'permanent',
    classifier_tag: 'pdf_structure',
    regex_pattern: '/(InvalidPDFException|MissingPDFException|UnknownErrorException|password)/i',
    rationale:
      'PDF is malformed or password-protected. Cannot ingest as-is.',
    needs_code_change: false,
    code_change_summary:
      'Operator action: ask the customer to remove the password / re-export the PDF.',
  },
}

const SYSTEM_PROMPT = `You are an expert backend engineer reviewing an UNCLASSIFIED failure from an aircraft document-ingestion pipeline.

The pipeline runs:
  upload → PDF probe → OCR (Document AI / Textract / OpenAI fallback) → field extraction → chunking → embedding (OpenAI text-embedding-3-large) → completed

Your job: propose how to classify it so the auto-heal layer can recover similar failures next time.

Guidelines:
  - "transient" = will probably succeed if retried (rate limits, timeouts, network blips, race-condition unique-key violations, transient 5xx, transient storage 400/500)
  - "permanent" = will keep failing without operator action (corrupt PDF, oversized page, missing config / API key, malformed input, file deleted from storage)
  - "unclear" = needs human judgment

Output a strict JSON proposal. The classifier_tag MUST be lowercase snake_case, descriptive, and unique per category. The regex_pattern MUST be JavaScript-compatible.

Be honest about uncertainty.`

interface SuggestionRequest {
  error_message?: string
  document_id?: string
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

  // 2. Parse body.
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

  // 3. SHORT-CIRCUIT: if our local classifier already has a tag for this
  //    error, return the canned explanation immediately. Don't spend an
  //    OpenAI call (or hit a 429 loop) on something we already understand.
  const localClassification = classifyIngestionFailure(errorMessage)
  if (localClassification.tag !== 'unknown' && KNOWN_TAG_EXPLANATIONS[localClassification.tag]) {
    return NextResponse.json({
      suggestion: {
        ...KNOWN_TAG_EXPLANATIONS[localClassification.tag],
        from_local_catalog: true,
      } satisfies AISuggestion,
    })
  }

  // 4. Pull doc context for richer LLM reasoning when needed.
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
        `Document context:`,
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

  // 5. Ask the LLM ONLY for genuinely-unknown patterns.
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'OpenAI is not configured (OPENAI_API_KEY missing). The local classifier did not match a known pattern, so this needs human review or to be fixed in lib/ingestion/failure-classifier.ts.',
      },
      { status: 503 },
    )
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
    const suggestion: AISuggestion = {
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
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 1000) : '',
      needs_code_change: parsed.needs_code_change === true,
      code_change_summary:
        typeof parsed.code_change_summary === 'string'
          ? parsed.code_change_summary.slice(0, 1000)
          : '',
      from_local_catalog: false,
    }
    return NextResponse.json({ suggestion })
  } catch (err) {
    // Surface helpful detail for the most likely cause (OpenAI quota
    // exhausted while you're trying to analyze a quota-exhausted error).
    const status = (err as { status?: number })?.status
    const msg = err instanceof Error ? err.message : String(err)
    if (status === 429 || /quota|rate[- ]?limit/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            "Can't run AI analysis right now — OpenAI itself is at quota or rate-limited. Top up at https://platform.openai.com/account/billing or wait a few minutes. (This is unusually meta if the error you're analyzing is also an OpenAI 429 — it's the same root cause.)",
        },
        { status: 502 },
      )
    }
    return NextResponse.json(
      {
        error: `LLM analysis failed: ${msg.slice(0, 400)}`,
      },
      { status: 502 },
    )
  }
}
