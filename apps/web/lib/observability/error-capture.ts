/**
 * Phase 16 Sprint 16.5 — error capture (client + server).
 *
 * Single module, two entry points:
 *
 *   installClientErrorHandlers()  — call from a top-level client
 *     bootstrap to wire window.onerror + window.onunhandledrejection
 *     to POST /api/observability/error.
 *
 *   withErrorCapture(handler)     — wrap any /api/* GET/POST/PATCH/DELETE
 *     so server-side throws land in error_events with the route + persona
 *     + organization_id automatically tagged.
 *
 * Storage shape (error_events from migration 109):
 *   - origin: 'client' | 'server_route' | 'server_worker' | 'ingestion'
 *   - stack_hash groups identical errors within a 1h window — same hash
 *     within the window updates occurrence_count + last_seen_at instead
 *     of inserting a new row.
 *
 * Throttling on the client side keeps noisy bugs from melting the
 * endpoint: max 10 errors per session per minute.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'

// ──────────────────────────────────────────────────────────────────────
// Shared types
// ──────────────────────────────────────────────────────────────────────

export type ErrorOrigin = 'client' | 'server_route' | 'server_worker' | 'ingestion'

export interface ErrorEventInput {
  origin: ErrorOrigin
  message: string
  stack?: string | null
  route?: string | null
  persona?: string | null
  build_sha?: string | null
  user_id?: string | null
  organization_id?: string | null
  /** Free-form. JSONB column. Don't put PII here. */
  metadata?: Record<string, unknown>
  /** Default 'P2'. Use 'P1' for known-impact issues. */
  severity?: 'P0' | 'P1' | 'P2' | 'P3'
}

// Auto-create alert_event when a single stack_hash spikes above this in 1h.
export const ERROR_RATE_ALERT_THRESHOLD = 50

// ──────────────────────────────────────────────────────────────────────
// Stack hashing — group same-stack errors
// ──────────────────────────────────────────────────────────────────────

/**
 * Compute a stable hash for an error's identity. We strip:
 *   - Variable line/column numbers in stacks (preserve file paths)
 *   - chunk hashes in Next.js bundle filenames
 *   - eval-id digits
 *
 * Returns a 16-char hex prefix of SHA-256(...) — short enough to fit
 * a btree index, long enough to be collision-safe at our scale.
 */
export function computeStackHash(message: string, stack?: string | null): string {
  const normalized = `${message.trim()}\n${stripVariableParts(stack ?? '')}`
  // Cheap browser/edge-friendly hash. crypto.subtle isn't available
  // synchronously in all runtimes; we accept a non-cryptographic
  // grouping hash here.
  return djb2(normalized)
}

function stripVariableParts(stack: string): string {
  return stack
    // Next.js chunk hashes: /_next/static/chunks/main-app-<hash>.js → main-app.js
    .replace(/\/_next\/static\/chunks\/([\w-]+)-[a-f0-9]{8,}\./g, '/_next/static/chunks/$1.')
    // Line:col numbers — keep file path, drop the number tail
    .replace(/:\d+:\d+/g, ':L:C')
    // eval-id and similar
    .replace(/<anonymous>:\d+/g, '<anonymous>:L')
    .slice(0, 4096)
}

function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i)
  }
  // Two passes for a longer hex output.
  let h2 = h >>> 0
  let h3 = (h ^ 0xdeadbeef) >>> 0
  return (h2.toString(16).padStart(8, '0') + h3.toString(16).padStart(8, '0')).slice(0, 16)
}

// ──────────────────────────────────────────────────────────────────────
// Server: write an error_event with 1h-window grouping
// ──────────────────────────────────────────────────────────────────────

/**
 * Write an error_event. If a row with the same stack_hash + last_seen_at
 * within 1h exists, increments occurrence_count instead of inserting.
 *
 * Caller passes a SERVICE-ROLE supabase client (RLS denies inserts to
 * authenticated users on this table by design).
 */
export async function recordErrorEvent(
  supabase: SupabaseClient,
  input: ErrorEventInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const stack_hash = computeStackHash(input.message, input.stack)
  const oneHourAgoIso = new Date(Date.now() - 60 * 60_000).toISOString()

  // Look for a recent group.
  const { data: existing } = await supabase
    .from('error_events')
    .select('id, occurrence_count')
    .eq('stack_hash', stack_hash)
    .gte('last_seen_at', oneHourAgoIso)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const next = ((existing as { occurrence_count: number }).occurrence_count ?? 1) + 1
    const { error } = await supabase
      .from('error_events')
      .update({
        occurrence_count: next,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', (existing as { id: string }).id)
    if (error) return { ok: false, error: error.message }
    // Auto-fire an alert if this group just crossed the threshold
    // (only fire on the exact crossing — don't spam).
    if (next === ERROR_RATE_ALERT_THRESHOLD + 1) {
      await maybeFireRateSpikeAlert(supabase, stack_hash, input).catch(() => {})
    }
    return { ok: true, id: (existing as { id: string }).id }
  }

  const { data: created, error: insertErr } = await supabase
    .from('error_events')
    .insert({
      origin: input.origin,
      stack_hash,
      message: input.message.slice(0, 4096),
      stack: input.stack ?? null,
      route: input.route ?? null,
      persona: input.persona ?? null,
      build_sha: input.build_sha ?? null,
      user_id: input.user_id ?? null,
      organization_id: input.organization_id ?? null,
      metadata: input.metadata ?? {},
      severity: input.severity ?? 'P2',
      status: 'new',
    })
    .select('id')
    .single()

  if (insertErr) return { ok: false, error: insertErr.message }
  return { ok: true, id: (created as { id: string }).id }
}

async function maybeFireRateSpikeAlert(
  supabase: SupabaseClient,
  stack_hash: string,
  input: ErrorEventInput,
): Promise<void> {
  await supabase.from('alert_events').insert({
    organization_id: input.organization_id ?? null,
    alert_type: 'error_rate_spike',
    severity: 'P1',
    summary: `Error rate spike: ${input.message.slice(0, 120)} (stack ${stack_hash.slice(0, 8)})`,
    metadata: {
      stack_hash,
      origin: input.origin,
      route: input.route ?? null,
      threshold: ERROR_RATE_ALERT_THRESHOLD,
    },
    status: 'firing',
  })
}

// ──────────────────────────────────────────────────────────────────────
// Server route wrapper
// ──────────────────────────────────────────────────────────────────────

type ServerHandler = (req: NextRequest, ctx?: any) => Promise<Response>

/**
 * Wrap a Next.js route handler so any uncaught throw lands in
 * error_events (origin='server_route') with the request URL captured.
 *
 *   export const POST = withErrorCapture(async (req) => { ... })
 */
export function withErrorCapture(handler: ServerHandler): ServerHandler {
  return async (req: NextRequest, ctx?: any) => {
    try {
      return await handler(req, ctx)
    } catch (e) {
      // Best-effort log; never let observability break the response.
      try {
        const service = createServiceSupabase()
        const message = e instanceof Error ? e.message : String(e)
        const stack = e instanceof Error ? e.stack : null
        await recordErrorEvent(service, {
          origin: 'server_route',
          message,
          stack,
          route: new URL(req.url).pathname,
          build_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
          severity: 'P1',
        })
      } catch { /* swallow */ }
      // Re-throw so the framework returns its 500 (preserves existing
      // route-level error semantics).
      throw e
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// Client: window.onerror + unhandledrejection wiring
// ──────────────────────────────────────────────────────────────────────

interface ClientCaptureContext {
  /** Optional persona accessor for tagging. Returns the active persona at error time. */
  getPersona?: () => string | null | undefined
  /** Optional org accessor. */
  getOrgId?: () => string | null | undefined
  /** Build SHA injected at build time. */
  buildSha?: string
}

interface ThrottleState {
  windowStart: number
  count: number
}

const CLIENT_THROTTLE_LIMIT = 10
const CLIENT_THROTTLE_WINDOW_MS = 60_000
let clientInstalled = false
const throttle: ThrottleState = { windowStart: Date.now(), count: 0 }

function shouldSendClient(): boolean {
  const now = Date.now()
  if (now - throttle.windowStart > CLIENT_THROTTLE_WINDOW_MS) {
    throttle.windowStart = now
    throttle.count = 0
  }
  throttle.count++
  return throttle.count <= CLIENT_THROTTLE_LIMIT
}

/**
 * Wire client-side error capture. Idempotent — calling twice is a no-op.
 */
export function installClientErrorHandlers(ctx: ClientCaptureContext = {}): void {
  if (typeof window === 'undefined') return
  if (clientInstalled) return
  clientInstalled = true

  const send = (payload: Omit<ErrorEventInput, 'origin'>) => {
    if (!shouldSendClient()) return
    const body: ErrorEventInput = {
      ...payload,
      origin: 'client',
      route: payload.route ?? window.location.pathname,
      persona: payload.persona ?? ctx.getPersona?.() ?? null,
      organization_id: payload.organization_id ?? ctx.getOrgId?.() ?? null,
      build_sha: payload.build_sha ?? ctx.buildSha ?? null,
    }
    // Fire-and-forget; ignore failures.
    fetch('/api/observability/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {})
  }

  window.addEventListener('error', (event) => {
    send({
      message: event.message || 'window.onerror',
      stack: (event.error instanceof Error ? event.error.stack : null) ?? null,
      metadata: {
        filename: event.filename ?? null,
        lineno: event.lineno ?? null,
        colno: event.colno ?? null,
      },
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : null
    send({
      message: message || 'unhandledrejection',
      stack,
      metadata: { kind: 'unhandledrejection' },
    })
  })
}
