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
  }
}
