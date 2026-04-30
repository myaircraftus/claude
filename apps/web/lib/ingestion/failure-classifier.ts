/**
 * Failure classifier — single source of truth for "is this transient?"
 * and "what category of failure is this?". Used by:
 *
 *   - /api/cron/heal-ingestions (decides which failed rows to auto-retry)
 *   - /api/documents/heal (same decision, user-side)
 *   - logIngestionFailure (writes a structured row to ingestion_failures)
 *
 * Adding a new failure mode = one entry in PATTERNS below + a redeploy.
 * From that moment on, the cron + UI heal auto-recover the new pattern,
 * and the admin dashboard groups it under its tag instead of dumping it
 * in 'unknown'.
 */

export type FailureSeverity = 'transient' | 'permanent' | 'unknown'

export interface FailureClassification {
  tag: string
  severity: FailureSeverity
  /** Human-readable explanation for the admin dashboard. */
  description: string
}

interface FailurePattern {
  tag: string
  severity: FailureSeverity
  match: RegExp
  description: string
}

// Order matters — more specific patterns should appear first.
const PATTERNS: FailurePattern[] = [
  // ── Transient: OpenAI / LLM service ─────────────────────────────────────
  {
    tag: 'openai_429',
    severity: 'transient',
    match: /(429|quota|rate[- ]?limit)/i,
    description: 'OpenAI rate limit or quota exhausted. Auto-retried with exponential backoff.',
  },
  {
    tag: 'openai_5xx',
    severity: 'transient',
    match: /OpenAI.* (5\d\d|service unavailable)/i,
    description: 'OpenAI service-side error. Auto-retried.',
  },
  {
    tag: 'openai_annotation_timeout',
    severity: 'transient',
    match: /OpenAI OCR annotation timed out/i,
    description: 'OpenAI structured-field annotation timed out. Now best-effort — never fails the doc.',
  },
  {
    tag: 'openai_pdf_ocr_timeout',
    severity: 'transient',
    match: /OpenAI PDF OCR timed out/i,
    description: 'OpenAI PDF-based OCR fallback timed out. Auto-retried.',
  },

  // ── Transient: Postgres / Supabase ──────────────────────────────────────
  {
    tag: 'postgres_statement_timeout',
    severity: 'transient',
    match: /canceling statement due to statement timeout/i,
    description: 'Postgres per-statement timeout. Big logbook cleanup mostly handled by ALTER FUNCTION SET; rare now.',
  },
  {
    tag: 'cleanup_ocr_segments_timeout',
    severity: 'transient',
    match: /Failed to clear OCR entry segments/i,
    description: 'Cleanup of old OCR segments hit the per-statement timeout. Auto-retried via the cleanup RPC.',
  },
  {
    tag: 'cleanup_chunks_timeout',
    severity: 'transient',
    match: /Failed to clear document chunks/i,
    description: 'Cleanup of old chunks timed out. Auto-retried.',
  },
  {
    tag: 'duplicate_key_pages',
    severity: 'transient',
    match: /duplicate key value .* document_pages/i,
    description: 'Race between two ingestion attempts on document_pages. Now upserts idempotently.',
  },
  {
    tag: 'duplicate_key_ocr_jobs',
    severity: 'transient',
    match: /duplicate key value .* ocr_page_jobs/i,
    description: 'Race between two ingestion attempts on ocr_page_jobs. Now upserts idempotently.',
  },
  {
    tag: 'duplicate_key_other',
    severity: 'transient',
    match: /duplicate key value/i,
    description: 'Race between concurrent attempts on a unique index. Auto-retried.',
  },
  {
    tag: 'postgres_deadlock',
    severity: 'transient',
    match: /deadlock detected/i,
    description: 'Postgres deadlock between concurrent operations. Auto-retried.',
  },

  // ── Transient: storage / network ────────────────────────────────────────
  {
    tag: 'pdf_download_400',
    severity: 'transient',
    match: /Failed to download PDF .* 400/,
    description: 'Supabase storage transient 400 on signed URL. Now retries 4× with backoff.',
  },
  {
    tag: 'pdf_download_5xx',
    severity: 'transient',
    match: /Failed to download PDF .* 5\d\d/,
    description: 'Storage 5xx error. Auto-retried.',
  },
  {
    tag: 'network_econnreset',
    severity: 'transient',
    match: /(ECONNRESET|ETIMEDOUT|EAI_AGAIN)/,
    description: 'Network blip during external API call. Auto-retried.',
  },
  {
    tag: 'gateway_timeout',
    severity: 'transient',
    match: /(503|504|gateway timeout)/i,
    description: 'Upstream gateway timeout. Auto-retried.',
  },
  {
    tag: 'function_timeout',
    severity: 'transient',
    match: /(timed out|timeout)/i,
    description: 'A pipeline step hit its timeout. Auto-retried.',
  },

  // ── Permanent: file-level / config errors ───────────────────────────────
  {
    tag: 'pdf_download_404',
    severity: 'permanent',
    match: /Failed to download PDF .* 404/,
    description: 'PDF file missing from storage. Re-upload required.',
  },
  {
    tag: 'pdf_download_403',
    severity: 'permanent',
    match: /Failed to download PDF .* 403/,
    description: 'PDF download forbidden — auth/key issue.',
  },
  {
    tag: 'ocr_not_configured',
    severity: 'permanent',
    match: /OCR engine is not configured|OcrNotConfiguredError/i,
    description: 'No OCR engine credentials configured. Add Document AI / Textract / OpenAI keys.',
  },
  {
    tag: 'pdf_oversize',
    severity: 'permanent',
    match: /(exceeds the maximum|object size)/i,
    description: 'Single PDF page exceeds the OCR engine size limit. File needs to be split.',
  },
  {
    tag: 'pdf_structure',
    severity: 'permanent',
    match: /(InvalidPDFException|MissingPDFException|UnknownErrorException|password)/i,
    description: 'PDF is malformed or password-protected. Cannot ingest.',
  },
]

const UNKNOWN_CLASSIFICATION: FailureClassification = {
  tag: 'unknown',
  severity: 'unknown',
  description: 'Unclassified error — flagged for review on /admin/ingestion-health.',
}

export function classifyIngestionFailure(message: string | null | undefined): FailureClassification {
  const text = (message ?? '').trim()
  if (!text) return UNKNOWN_CLASSIFICATION

  for (const pattern of PATTERNS) {
    if (pattern.match.test(text)) {
      return {
        tag: pattern.tag,
        severity: pattern.severity,
        description: pattern.description,
      }
    }
  }
  return UNKNOWN_CLASSIFICATION
}

/** Returns true if a failure should auto-retry via the cron / UI heal. */
export function isTransientIngestionFailure(message: string | null | undefined): boolean {
  return classifyIngestionFailure(message).severity === 'transient'
}
