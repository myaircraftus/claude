/**
 * Phase 11 Sprint 11.2 — dispatch-mode helper.
 *
 * 'queue' (default): dispatcher enqueues a vision_index_job row and
 * returns immediately. The Colab queue worker (Sprint 11.3) polls the
 * table and processes jobs. The Modal fallback sweep cron (Sprint 11.4)
 * picks up stuck jobs and dispatches them via the legacy DIRECT path.
 *
 * 'direct' (legacy / emergency): dispatcher calls worker.embed()
 * synchronously inside the request. Preserved as an env-flag fallback
 * for ops emergencies — when the Colab worker is offline AND the sweep
 * cron isn't reaching jobs fast enough.
 *
 * Source of truth: VISION_DISPATCH_MODE env var.
 */
export type DispatchMode = 'queue' | 'direct'

/** Reads VISION_DISPATCH_MODE; defaults to 'queue' (the new default). */
export function dispatchMode(envOverride?: string): DispatchMode {
  const value = (envOverride ?? process.env.VISION_DISPATCH_MODE ?? 'queue').toLowerCase()
  if (value === 'direct') return 'direct'
  // Anything other than 'direct' (including unset, typos, 'queue') means queue.
  return 'queue'
}

/**
 * Convenience for callers that need a one-shot decision: "should I
 * call the worker right now, or just leave the job for someone else?"
 */
export function shouldDispatchSynchronously(envOverride?: string): boolean {
  return dispatchMode(envOverride) === 'direct'
}
