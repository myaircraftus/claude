/**
 * Phase 11 Sprint 11.1 — Worker heartbeat service.
 *
 * The Colab queue worker pings vision_worker_heartbeat every 30s.
 * The Modal fallback sweep cron reads it to decide "is anything alive
 * on the cheap path right now?" before pulling a stuck job over to
 * Modal.
 *
 * Workers are global (not org-scoped). Only service-role writes;
 * org admins read for the /admin/vision/workers dashboard.
 *
 * Migration 102 NOT applied — these helpers will work as soon as
 * Andy applies via apps/web/scripts/apply-102.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

// ─── Types ────────────────────────────────────────────────────────────

export type WorkerStatus = 'idle' | 'busy' | 'stopping'
export type WorkerGpuHost =
  | 'colab'
  | 'colab-pro'
  | 'colab-a100'
  | 'modal'
  | 'modal-stub'
  | 'replicate'
  | 'runpod'
  | 'stub'

const STATUS_VALUES = ['idle', 'busy', 'stopping'] as const
const HOST_VALUES = [
  'colab',
  'colab-pro',
  'colab-a100',
  'modal',
  'modal-stub',
  'replicate',
  'runpod',
  'stub',
] as const

export interface WorkerHeartbeatRow {
  id: string
  worker_id: string
  gpu_host: WorkerGpuHost
  last_seen_at: string
  status: WorkerStatus
  jobs_processed_total: number
  last_job_id: string | null
  last_error: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── Schemas ──────────────────────────────────────────────────────────

export const HeartbeatUpsertSchema = z.object({
  worker_id: z.string().min(1).max(200),
  gpu_host: z.enum(HOST_VALUES),
  status: z.enum(STATUS_VALUES).optional(),
  jobs_processed_total: z.number().int().min(0).optional(),
  last_job_id: z.string().uuid().nullable().optional(),
  last_error: z.string().max(4000).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
})

// ─── Service ──────────────────────────────────────────────────────────

/**
 * Upsert the heartbeat row for this worker. Idempotent — multiple
 * calls update the single row keyed on worker_id.
 *
 * Returns the upserted row. Throws on supabase error so the caller
 * can decide whether to retry (Colab notebook does try/except + log).
 */
export async function upsertHeartbeat(
  supabase: SupabaseClient,
  args: z.infer<typeof HeartbeatUpsertSchema>,
): Promise<WorkerHeartbeatRow> {
  const validated = HeartbeatUpsertSchema.parse(args)
  const row: Record<string, unknown> = {
    worker_id: validated.worker_id,
    gpu_host: validated.gpu_host,
    last_seen_at: new Date().toISOString(),
  }
  if (validated.status !== undefined) row.status = validated.status
  if (validated.jobs_processed_total !== undefined) row.jobs_processed_total = validated.jobs_processed_total
  if (validated.last_job_id !== undefined) row.last_job_id = validated.last_job_id
  if (validated.last_error !== undefined) row.last_error = validated.last_error
  if (validated.metadata !== undefined) row.metadata = validated.metadata

  const { data, error } = await supabase
    .from('vision_worker_heartbeat')
    .upsert(row, { onConflict: 'worker_id' })
    .select('*')
    .single()
  if (error) throw new Error(`upsertHeartbeat: ${error.message}`)
  return data as WorkerHeartbeatRow
}

/**
 * Get every worker that's pinged in the last `maxAgeSeconds` (default 60s).
 * The Modal fallback cron uses this with maxAgeSeconds=60 to check
 * if any cheap-path worker is alive before falling back.
 */
export async function getActiveWorkers(
  supabase: SupabaseClient,
  maxAgeSeconds = 60,
): Promise<WorkerHeartbeatRow[]> {
  const cutoff = new Date(Date.now() - maxAgeSeconds * 1000).toISOString()
  const { data, error } = await supabase
    .from('vision_worker_heartbeat')
    .select('*')
    .gte('last_seen_at', cutoff)
    .order('last_seen_at', { ascending: false })
  if (error) throw new Error(`getActiveWorkers: ${error.message}`)
  return (data ?? []) as WorkerHeartbeatRow[]
}

/**
 * Quick boolean: is this specific worker alive in the last
 * `maxAgeSeconds`? Used by the admin page to highlight stale rows.
 */
export async function isWorkerAlive(
  supabase: SupabaseClient,
  workerId: string,
  maxAgeSeconds = 60,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - maxAgeSeconds * 1000).toISOString()
  const { data, error } = await supabase
    .from('vision_worker_heartbeat')
    .select('worker_id')
    .eq('worker_id', workerId)
    .gte('last_seen_at', cutoff)
    .maybeSingle()
  if (error) throw new Error(`isWorkerAlive: ${error.message}`)
  return data !== null
}

/**
 * Convenience: return the count of "busy" + "idle" workers in the
 * window — i.e., workers that could pick up a job right now. The
 * sweep cron uses this; if it returns 0 AND there's a stuck job,
 * Modal takes over.
 */
export async function countAvailableWorkers(
  supabase: SupabaseClient,
  maxAgeSeconds = 60,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeSeconds * 1000).toISOString()
  const { count, error } = await supabase
    .from('vision_worker_heartbeat')
    .select('*', { count: 'exact', head: true })
    .gte('last_seen_at', cutoff)
    .in('status', ['idle', 'busy'])
  if (error) throw new Error(`countAvailableWorkers: ${error.message}`)
  return count ?? 0
}

/**
 * Soft-delete: mark a worker as stopping. The Colab notebook calls
 * this in its finally-block when the cell halts cleanly.
 */
export async function markWorkerStopping(
  supabase: SupabaseClient,
  workerId: string,
): Promise<void> {
  const { error } = await supabase
    .from('vision_worker_heartbeat')
    .update({ status: 'stopping' })
    .eq('worker_id', workerId)
  if (error) throw new Error(`markWorkerStopping: ${error.message}`)
}
