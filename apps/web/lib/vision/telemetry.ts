/**
 * Phase 8 Vision RAG — retrieval telemetry (Sprint 8.8).
 *
 * Append-only writes to vision_retrieval_log + read helpers for the
 * /admin/vision/telemetry dashboard.
 *
 * The write side is intentionally fire-and-forget — telemetry must
 * NEVER block the request path. Any insert error is swallowed and
 * console.warn'd.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { calibrateConfidence, type CalibrationSignals } from './confidence'

export interface RetrievalLogInput {
  organization_id: string
  user_id: string | null
  route: 'search' | 'answer'
  mode?: 'hybrid' | 'text' | 'vision' | null
  search_query: string
  result_count: number
  top_combined_score?: number | null
  raw_confidence?: number | null
  calibrated_confidence?: number | null
  fallback_invoked?: boolean
  fallback_model?: string | null
  fallback_citations?: number | null
  retrieval_ms?: number | null
  total_ms: number
  status?: 'ok' | 'error'
  error_message?: string | null
}

/** Best-effort write. Never throws. */
export async function logRetrieval(
  supabase: SupabaseClient,
  input: RetrievalLogInput,
): Promise<void> {
  try {
    const row = {
      ...input,
      mode: input.mode ?? null,
      top_combined_score: input.top_combined_score ?? null,
      raw_confidence: input.raw_confidence ?? null,
      calibrated_confidence: input.calibrated_confidence ?? null,
      fallback_invoked: input.fallback_invoked ?? false,
      fallback_model: input.fallback_model ?? null,
      fallback_citations: input.fallback_citations ?? null,
      retrieval_ms: input.retrieval_ms ?? null,
      status: input.status ?? 'ok',
      error_message: input.error_message ?? null,
    }
    const { error } = await supabase.from('vision_retrieval_log').insert(row)
    if (error) {
      console.warn('[vision/telemetry] logRetrieval insert failed:', error.message)
    }
  } catch (err) {
    console.warn('[vision/telemetry] logRetrieval threw:', err)
  }
}

/**
 * Resolve calibration signals for (org × query × page) by reading
 * vision_review_queue + vision_feedback. Used by the search/answer
 * routes before logging telemetry.
 */
export async function resolveCalibrationSignals(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    searchQuery: string
    visionPageId: string
    fallbackCitedTopPage?: boolean
  },
): Promise<CalibrationSignals> {
  // Latest reviewer verdict on this exact (query × page).
  const { data: reviewRow } = await supabase
    .from('vision_review_queue')
    .select('status, reviewed_at')
    .eq('organization_id', args.organizationId)
    .eq('vision_page_id', args.visionPageId)
    .eq('search_query', args.searchQuery)
    .is('deleted_at', null)
    .order('reviewed_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  // Net feedback for the same (query × page).
  const { data: fbRows } = await supabase
    .from('vision_feedback')
    .select('rating')
    .eq('organization_id', args.organizationId)
    .eq('vision_page_id', args.visionPageId)
    .eq('search_query', args.searchQuery)

  const ratings = (fbRows ?? []) as Array<{ rating: number }>
  const feedbackTotalRating = ratings.reduce((s, r) => s + (r.rating ?? 0), 0)
  const feedbackRaterCount = ratings.length

  return {
    reviewerVerdict: reviewRow?.status as CalibrationSignals['reviewerVerdict'],
    feedbackTotalRating,
    feedbackRaterCount,
    fallbackCitedTopPage: args.fallbackCitedTopPage,
  }
}

/**
 * Convenience: resolve signals + calibrate in one call. The route
 * layer uses this to compute the calibrated_confidence value before
 * writing the telemetry row.
 */
export async function calibrateForLogging(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    searchQuery: string
    visionPageId: string | null
    rawScore: number
    fallbackCitedTopPage?: boolean
  },
): Promise<{ raw: number; calibrated: number }> {
  if (!args.visionPageId) {
    const result = calibrateConfidence(args.rawScore, {})
    return { raw: result.raw, calibrated: result.calibrated }
  }
  const signals = await resolveCalibrationSignals(supabase, {
    organizationId: args.organizationId,
    searchQuery: args.searchQuery,
    visionPageId: args.visionPageId,
    fallbackCitedTopPage: args.fallbackCitedTopPage,
  })
  const result = calibrateConfidence(args.rawScore, signals)
  return { raw: result.raw, calibrated: result.calibrated }
}

// ─── Read helpers for /admin/vision/telemetry ────────────────────────

export interface TelemetryWindow {
  /** ISO timestamp lower bound. */
  since: string
  /** ISO timestamp upper bound (default: now). */
  until?: string
}

export interface TelemetrySummary {
  totalRequests: number
  byRoute: Record<'search' | 'answer', number>
  fallbackRate: number       // 0-1, share of /answer requests that fell back
  avgRawConfidence: number | null
  avgCalibratedConfidence: number | null
  p50LatencyMs: number | null
  p95LatencyMs: number | null
  errorRate: number          // 0-1, share with status='error'
}

export async function getTelemetrySummary(
  supabase: SupabaseClient,
  orgId: string,
  window: TelemetryWindow,
): Promise<TelemetrySummary> {
  const { data, error } = await supabase
    .from('vision_retrieval_log')
    .select('route, raw_confidence, calibrated_confidence, fallback_invoked, total_ms, status')
    .eq('organization_id', orgId)
    .gte('created_at', window.since)
    .lte('created_at', window.until ?? new Date().toISOString())
    .limit(10_000)
  if (error) throw new Error(`getTelemetrySummary: ${error.message}`)

  const rows = (data ?? []) as Array<{
    route: 'search' | 'answer'
    raw_confidence: number | null
    calibrated_confidence: number | null
    fallback_invoked: boolean
    total_ms: number
    status: 'ok' | 'error'
  }>

  if (rows.length === 0) {
    return {
      totalRequests: 0,
      byRoute: { search: 0, answer: 0 },
      fallbackRate: 0,
      avgRawConfidence: null,
      avgCalibratedConfidence: null,
      p50LatencyMs: null,
      p95LatencyMs: null,
      errorRate: 0,
    }
  }

  const byRoute: Record<'search' | 'answer', number> = { search: 0, answer: 0 }
  let rawSum = 0, rawCount = 0
  let calSum = 0, calCount = 0
  let answerCount = 0, fallbackCount = 0
  let errorCount = 0
  const latencies: number[] = []

  for (const r of rows) {
    byRoute[r.route] = (byRoute[r.route] ?? 0) + 1
    if (typeof r.raw_confidence === 'number') {
      rawSum += r.raw_confidence
      rawCount++
    }
    if (typeof r.calibrated_confidence === 'number') {
      calSum += r.calibrated_confidence
      calCount++
    }
    if (r.route === 'answer') {
      answerCount++
      if (r.fallback_invoked) fallbackCount++
    }
    if (r.status === 'error') errorCount++
    if (typeof r.total_ms === 'number') latencies.push(r.total_ms)
  }

  latencies.sort((a, b) => a - b)
  const pct = (p: number) =>
    latencies.length === 0 ? null : latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))]

  return {
    totalRequests: rows.length,
    byRoute,
    fallbackRate: answerCount === 0 ? 0 : fallbackCount / answerCount,
    avgRawConfidence: rawCount === 0 ? null : rawSum / rawCount,
    avgCalibratedConfidence: calCount === 0 ? null : calSum / calCount,
    p50LatencyMs: pct(0.5),
    p95LatencyMs: pct(0.95),
    errorRate: rows.length === 0 ? 0 : errorCount / rows.length,
  }
}

/** Top low-confidence queries (calibrated < 0.5) over the window. */
export async function getLowConfidenceQueries(
  supabase: SupabaseClient,
  orgId: string,
  window: TelemetryWindow,
  limit = 20,
): Promise<Array<{ search_query: string; count: number; avg_calibrated: number }>> {
  const { data, error } = await supabase
    .from('vision_retrieval_log')
    .select('search_query, calibrated_confidence')
    .eq('organization_id', orgId)
    .gte('created_at', window.since)
    .lte('created_at', window.until ?? new Date().toISOString())
    .lt('calibrated_confidence', 0.5)
    .limit(2_000)
  if (error) throw new Error(`getLowConfidenceQueries: ${error.message}`)

  const map = new Map<string, { sum: number; n: number }>()
  for (const r of (data ?? []) as Array<{ search_query: string; calibrated_confidence: number | null }>) {
    if (typeof r.calibrated_confidence !== 'number') continue
    const cur = map.get(r.search_query) ?? { sum: 0, n: 0 }
    cur.sum += r.calibrated_confidence
    cur.n += 1
    map.set(r.search_query, cur)
  }

  const out = Array.from(map.entries()).map(([search_query, { sum, n }]) => ({
    search_query,
    count: n,
    avg_calibrated: sum / n,
  }))
  out.sort((a, b) => b.count - a.count)
  return out.slice(0, limit)
}
