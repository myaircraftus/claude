/**
 * Shim react-dom Resource APIs (preload / preconnect / prefetchDNS) for
 * Next.js 14's RSC preloads.js. These APIs were added in react-dom@18.3
 * canary and react@19 — the 18.3.1 stable release ships without them,
 * which causes Next to throw "_reactdom.default.preload is not a function"
 * during SSR of pages with CSS chunks to preload. No-op shims are safe:
 * the browser already handles these hints via <link rel="preload"> tags
 * that Next emits separately.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const ReactDOM = (await import('react-dom')) as any
    if (typeof ReactDOM.preload !== 'function') ReactDOM.preload = () => {}
    if (typeof ReactDOM.preconnect !== 'function') ReactDOM.preconnect = () => {}
    if (typeof ReactDOM.prefetchDNS !== 'function') ReactDOM.prefetchDNS = () => {}
    if (typeof ReactDOM.preloadModule !== 'function') ReactDOM.preloadModule = () => {}
    if (typeof ReactDOM.preinit !== 'function') ReactDOM.preinit = () => {}
    if (typeof ReactDOM.preinitModule !== 'function') ReactDOM.preinitModule = () => {}

    // Sentry — optional. The SDK is only imported when SENTRY_DSN is
    // present so we don't pay the bundle cost on local dev or in CI
    // builds without the secret. The ops.error-rate-sentinel agent is
    // a second line of defence that runs on in-DB signals when Sentry
    // is unavailable.
    if (process.env.SENTRY_DSN) {
      try {
        const Sentry = (await import('@sentry/nextjs').catch(() => null)) as any
        if (Sentry && typeof Sentry.init === 'function') {
          Sentry.init({
            dsn: process.env.SENTRY_DSN,
            tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.05'),
            environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
            release: process.env.VERCEL_GIT_COMMIT_SHA,
            ignoreErrors: [
              // RSC noise — never useful in a Sentry queue
              'NEXT_NOT_FOUND',
              'NEXT_REDIRECT',
            ],
          })
        }
      } catch (err) {
        console.warn(
          '[instrumentation] Sentry init skipped:',
          (err as Error).message,
        )
      }
    }
  }
}

/**
 * Next.js 15 calls onRequestError for server errors. Forwards to
 * Sentry if loaded; otherwise no-ops.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
): Promise<void> {
  if (!process.env.SENTRY_DSN) return
  try {
    const Sentry = (await import('@sentry/nextjs').catch(() => null)) as any
    if (Sentry?.captureRequestError) {
      Sentry.captureRequestError(err, request, context)
    } else if (Sentry?.captureException) {
      Sentry.captureException(err)
    }
  } catch {
    // best-effort
  }
}
