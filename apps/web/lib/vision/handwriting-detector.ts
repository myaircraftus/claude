/**
 * Phase 14 Sprint 14.4 — handwriting pre-flight detector.
 *
 * Looks at the first N pages of a document and asks Claude Vision what
 * fraction of the visible text is handwritten vs printed. Returns a
 * value in [0, 1]; the caller writes documents.handwriting_pct +
 * suggests_review (when above the configured threshold).
 *
 * Sacred boundary: this module is a NEW capability sitting alongside
 * the OCR pipeline (`lib/ocr/`) — it doesn't modify any sacred code.
 * It uses a separate signed-URL pattern + Anthropic API call.
 *
 * Design notes:
 *   - Heuristic is intentionally conservative; we'd rather over-flag
 *     handwriting (and let the customer decline review) than miss it.
 *   - We sample at most 5 pages per doc to keep the Anthropic API
 *     budget bounded.
 *   - On any error, we fail closed (no detection result) — the upload
 *     proceeds without the review banner. Better silent miss than
 *     blocking a user mid-upload.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { PROCESSING_RULES } from '@/lib/billing/pricing-config'

export interface HandwritingResult {
  /** Fraction in [0, 1]. 0 = entirely printed; 1 = entirely handwritten. */
  handwritingPct: number
  /** Convenience: handwritingPct > PROCESSING_RULES.handwritingThreshold. */
  suggestsReview: boolean
  /** How many pages we sampled (cap=5). */
  sampledPages: number
  /** Detector ID for telemetry. */
  detector: 'claude-vision' | 'colqwen2-patches' | 'unknown'
}

const MAX_SAMPLED_PAGES = 5

/**
 * Run the handwriting detector against the first MAX_SAMPLED_PAGES of
 * a doc. Reads page images from the `vision-pages` bucket via signed
 * URLs.
 *
 * Returns null on any error — the caller treats null as "skip
 * banner". Errors are logged but never thrown.
 */
export async function detectHandwriting(
  supabase: SupabaseClient,
  args: {
    documentId: string
    organizationId: string
    pageCount: number
  },
): Promise<HandwritingResult | null> {
  const sampleSize = Math.min(MAX_SAMPLED_PAGES, args.pageCount)
  if (sampleSize <= 0) return null

  // Look up the canonical page paths (created by either the renderer
  // or the auto-dispatch placeholder helper).
  const { data: pages } = await supabase
    .from('vision_pages')
    .select('id, page_image_path, page_number')
    .eq('source_document_id', args.documentId)
    .eq('organization_id', args.organizationId)
    .order('page_number', { ascending: true })
    .limit(sampleSize)
  if (!pages || pages.length === 0) return null

  // Mint signed URLs for each.
  const signedUrls: string[] = []
  for (const p of pages as any[]) {
    if (!p.page_image_path) continue
    const { data, error } = await supabase.storage
      .from('vision-pages')
      .createSignedUrl(p.page_image_path, 300)
    if (error || !data?.signedUrl) continue
    signedUrls.push(data.signedUrl)
  }
  if (signedUrls.length === 0) return null

  // Call Anthropic Claude Vision. We keep the contract narrow: the model
  // must reply with a single integer 0-100 (percent handwritten).
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('[handwriting-detector] ANTHROPIC_API_KEY missing; skipping')
    return null
  }

  try {
    const userContent: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text:
          'Look at these document pages. Reply with ONLY a single integer 0-100 ' +
          'representing the approximate percentage of visible text that is HANDWRITTEN ' +
          '(as opposed to printed/typed). 0 means entirely printed; 100 means entirely ' +
          'handwritten. No prose, no explanation, just the number.',
      },
    ]
    for (const url of signedUrls) {
      userContent.push({
        type: 'image',
        source: { type: 'url', url },
      })
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 16,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      console.warn('[handwriting-detector] anthropic error', res.status)
      return null
    }
    const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
    const text = body.content?.find((c) => c.type === 'text')?.text?.trim() ?? ''
    const pct = parseHandwritingPercent(text)
    if (pct === null) {
      console.warn('[handwriting-detector] could not parse model response:', text.slice(0, 60))
      return null
    }
    const fraction = pct / 100
    return {
      handwritingPct: fraction,
      suggestsReview: fraction > PROCESSING_RULES.handwritingThreshold,
      sampledPages: signedUrls.length,
      detector: 'claude-vision',
    }
  } catch (err) {
    console.warn('[handwriting-detector] error:', err)
    return null
  }
}

/**
 * Parse an integer percentage from the model's reply. Tolerates
 * formats like "30", "30%", "Approximately 30", "30 percent".
 * Returns null if no integer in [0, 100] can be extracted.
 */
export function parseHandwritingPercent(text: string): number | null {
  if (!text) return null
  const m = /(\d{1,3})/.exec(text)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  if (n < 0 || n > 100) return null
  return n
}

/**
 * Persist the detector result into the documents row. Updates both
 * handwriting_pct and suggests_review atomically.
 */
export async function recordHandwritingResult(
  supabase: SupabaseClient,
  documentId: string,
  result: HandwritingResult,
): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update({
      handwriting_pct: result.handwritingPct,
      suggests_review: result.suggestsReview,
    })
    .eq('id', documentId)
  if (error) throw new Error(`recordHandwritingResult: ${error.message}`)
}
