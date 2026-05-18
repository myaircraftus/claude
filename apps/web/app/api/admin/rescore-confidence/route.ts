/**
 * POST /api/admin/rescore-confidence
 *
 * Triage the OCR review queue. Every pending `review_queue_items` row links to
 * OCR-pipeline entities (ocr_extracted_events / ocr_entry_segments /
 * ocr_page_jobs) that already carry confidence data. This endpoint re-derives a
 * single 0-1 confidence per pending row (lib/ocr/rescore.ts) and reports — or,
 * in apply mode, auto-resolves — the high-confidence rows so the human queue
 * only holds rows that genuinely need a person.
 *
 *   POST /api/admin/rescore-confidence
 *     → DRY RUN (default). Computes everything, writes NOTHING. Reports how
 *       many rows would auto-resolve at a range of thresholds.
 *   POST /api/admin/rescore-confidence?apply=true
 *     → Writes confidence_score to every pending row and sets status=resolved +
 *       auto_resolved=true on rows at/above the threshold.
 *   ?threshold=0.85  → override the auto-resolve cutoff (0-1, default 0.85).
 *
 * Admin persona only. Scoped to the caller's organization.
 *
 * NOTE: this is sourced from the OCR pipeline's own confidence — NOT Qwen2. The
 * vision pipeline produces visual embeddings only and never emits OCR text or a
 * confidence score, so there is nothing "post-GPU" to re-score from.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentPersona } from '@/lib/persona/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'
import {
  rescoreReviewItem,
  AUTO_RESOLVE_THRESHOLD,
  type ConfidenceBand,
  type RescoreInput,
} from '@/lib/ocr/rescore'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** A pending review_queue_items row joined with its OCR entities. */
interface PendingRow {
  id: string
  ocr_extracted_event: RescoreInput['event'] | RescoreInput['event'][]
  ocr_entry_segment: RescoreInput['segment'] | RescoreInput['segment'][]
  ocr_page_job: RescoreInput['pageJob'] | RescoreInput['pageJob'][]
}

/** Supabase embeds a to-one relation as an object, but sometimes types it as an array. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

const PROBE_THRESHOLDS = [0.6, 0.7, 0.8, 0.85, 0.9]

export async function POST(req: NextRequest) {
  const startedAt = Date.now()

  // --- Auth + persona gate --------------------------------------------------
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let persona: string
  try {
    ;({ persona } = await getCurrentPersona())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (persona !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden — admin persona required' },
      { status: 403 },
    )
  }

  // --- Params ---------------------------------------------------------------
  const apply = req.nextUrl.searchParams.get('apply') === 'true'
  const thrParam = Number(req.nextUrl.searchParams.get('threshold'))
  const threshold =
    Number.isFinite(thrParam) && thrParam > 0 && thrParam <= 1
      ? thrParam
      : AUTO_RESOLVE_THRESHOLD

  const supabase = createServiceSupabase()

  // --- Load every pending review item for this org (paginated) -------------
  const pending: PendingRow[] = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('review_queue_items')
      .select(
        `id,
         ocr_extracted_event:ocr_extracted_event_id(confidence_overall, event_date, tach_time, airframe_tt, mechanic_name, mechanic_cert_number, ia_number, raw_text),
         ocr_entry_segment:ocr_entry_segment_id(confidence, text_content, normalized_text),
         ocr_page_job:ocr_page_job_id(arbitration_confidence, ocr_confidence)`,
      )
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'pending')
      .eq('auto_resolved', false)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const rows = (data ?? []) as unknown as PendingRow[]
    pending.push(...rows)
    if (rows.length < PAGE) break
  }

  // --- Rescore every row (pure, no writes) ---------------------------------
  const scored = pending.map((row) => {
    const result = rescoreReviewItem(
      {
        event: one(row.ocr_extracted_event),
        segment: one(row.ocr_entry_segment),
        pageJob: one(row.ocr_page_job),
      },
      threshold,
    )
    return { id: row.id, ...result }
  })

  const bandCounts: Record<ConfidenceBand, number> = {
    critical: 0,
    medium: 0,
    low: 0,
    auto: 0,
  }
  const basisCounts = { stored_confidence: 0, field_heuristic: 0 }
  for (const s of scored) {
    bandCounts[s.band] += 1
    basisCounts[s.basis] += 1
  }

  const wouldAutoResolve = scored.filter((s) => s.score >= threshold)
  const atThresholds: Record<string, number> = {}
  for (const t of PROBE_THRESHOLDS) {
    atThresholds[t.toFixed(2)] = scored.filter((s) => s.score >= t).length
  }

  // --- DRY RUN: report only, no writes -------------------------------------
  if (!apply) {
    return NextResponse.json({
      mode: 'dry_run',
      threshold,
      total_pending: scored.length,
      by_band: bandCounts,
      by_basis: basisCounts,
      would_auto_resolve: wouldAutoResolve.length,
      would_remain_for_human_review: scored.length - wouldAutoResolve.length,
      auto_resolve_count_at_threshold: atThresholds,
      note: 'No rows were modified. Re-POST with ?apply=true to perform the auto-resolve.',
      duration_ms: Date.now() - startedAt,
    })
  }

  // --- APPLY: persist confidence_score; auto-resolve the high-confidence ----
  // Group ids by 2-decimal score so the whole queue is updated in a bounded
  // number of bulk statements instead of one UPDATE per row.
  const nowIso = new Date().toISOString()
  const thrPct = Math.round(threshold * 100)

  const remainByScore = new Map<number, string[]>()
  const resolveByScore = new Map<number, string[]>()
  for (const s of scored) {
    const rounded = Math.round(s.score * 100) / 100
    const target = s.score >= threshold ? resolveByScore : remainByScore
    const ids = target.get(rounded) ?? []
    ids.push(s.id)
    target.set(rounded, ids)
  }

  let rescored = 0
  let autoResolved = 0

  // Rows that stay in the queue — just annotate confidence_score (for sorting).
  for (const [score, ids] of remainByScore) {
    const { error } = await supabase
      .from('review_queue_items')
      .update({ confidence_score: score })
      .in('id', ids)
    if (!error) rescored += ids.length
  }

  // Rows at/above threshold — annotate + auto-resolve. auto_resolved=true keeps
  // them filterable and reversible; resolved_by stays null (no human acted).
  for (const [score, ids] of resolveByScore) {
    const { error } = await supabase
      .from('review_queue_items')
      .update({
        confidence_score: score,
        status: 'resolved',
        auto_resolved: true,
        resolved_at: nowIso,
        resolution_notes: `Auto-resolved by OCR confidence rescore (score ${Math.round(
          score * 100,
        )}%, threshold ${thrPct}%).`,
      })
      .in('id', ids)
    if (!error) {
      rescored += ids.length
      autoResolved += ids.length
    }
  }

  return NextResponse.json({
    mode: 'apply',
    threshold,
    total_rescored: rescored,
    auto_resolved: autoResolved,
    remaining_for_human_review: scored.length - autoResolved,
    by_band: bandCounts,
    duration_ms: Date.now() - startedAt,
  })
}
