/**
 * Phase 16 Sprint 16.5 — Client-only error capture handlers.
 *
 * Split out from `./error-capture.ts` so Client Components
 * (e.g. `components/observability/ClientErrorBoundary.tsx`) can
 * import `installClientErrorHandlers` without dragging the server-only
 * `createServiceSupabase` (which uses `next/headers`) into the client
 * bundle.
 *
 * Background: a `'use client'` component importing from
 * `lib/observability/error-capture` caused Next.js 14 to bundle the
 * whole server-side module, which transitively pulled `next/headers`.
 * The build then aborted with:
 *
 *     You're importing a component that needs next/headers. That only
 *     works in a Server Component …
 *
 * This module has zero server-only imports and is therefore safe to
 * import from any `'use client'` boundary.
 *
 * On-the-wire contract is unchanged: the handlers POST to
 * `/api/observability/error`, where the server module's
 * `withErrorCapture` + `recordErrorEvent` do the DB insert.
 */

export interface ClientCaptureContext {
  /** Optional persona accessor for tagging. Returns the active persona at error time. */
  getPersona?: () => string | null | undefined
  /** Optional org accessor. */
  getOrgId?: () => string | null | undefined
  /** Build SHA injected at build time. */
  buildSha?: string
}

/** Payload shape sent to /api/observability/error. Mirrors
 * `ErrorEventInput` in `./error-capture.ts` (intentionally duplicated
 * so this module has zero dependencies on the server file). */
interface ClientErrorPayload {
  origin: 'client'
  message: string
  stack?: string | null
  route?: string | null
  persona?: string | null
  organization_id?: string | null
  build_sha?: string | null
  metadata?: Record<string, unknown>
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

  const send = (payload: Omit<ClientErrorPayload, 'origin'>) => {
    if (!shouldSendClient()) return
    const body: ClientErrorPayload = {
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
