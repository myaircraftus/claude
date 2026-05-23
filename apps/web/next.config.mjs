/** @type {import('next').NextConfig} */
// BUILD_BUSTER 2026-05-23T21:00Z — /communications was 404ing in prod
// even though the (app)/communications/page.tsx file existed. The build
// cache from a pre-failed-deploy-streak deploy was being reused; this
// timestamp bump forces a clean rebuild including the /communications
// route.
//
// PRIOR BUSTER 2026-05-02T15:33Z — Vercel was serving a pre-Phase-1.1 build that
// rewrote /scheduler /time-off /clock /compliance /tools /inspections /vendors
// /meters /inbox to /dashboard.
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      '@trigger.dev/sdk',
      'puppeteer-core',
      '@sparticuz/chromium',
      'pdfjs-dist',
      // Tach-time browser-automation deps — Next 14 SWC can't parse
      // the private-class-fields in undici@7 that @vercel/sandbox
      // transitively pulls. Externalizing keeps them out of webpack
      // and they're loaded at runtime via require() instead.
      '@vercel/sandbox',
      'playwright-core',
      'undici',
    ],
    // SOP Library reads docs/sop/*.md at runtime via apps/web/lib/sop/parser.ts.
    // These files live OUTSIDE the apps/web build root, so Vercel's default
    // file-tracing won't bundle them with the serverless function. We add
    // them here so they're available at runtime.
    outputFileTracingIncludes: {
      '/sop-library/**': ['../../docs/sop/**'],
      '/api/admin/sop/**': ['../../docs/sop/**'],
      // SOP AI Query + Simulator endpoints both call listSops() at request
      // time, so they need the markdown bundled with the function too.
      '/api/sop/**': ['../../docs/sop/**'],
    },
  },
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      'motion/react': 'framer-motion',
      ...(isServer ? { canvas: false } : {}),
    }

    if (isServer) {
      // Keep optional heavy deps external — loaded via require() at
      // runtime only. Belt-and-braces alongside the experimental
      // serverComponentsExternalPackages list above.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'puppeteer-core',
        '@sparticuz/chromium',
        '@vercel/sandbox',
        'playwright-core',
        'undici',
      ]
    }
    return config
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    // Full security header set. NOTE: this file (next.config.mjs) is the
    // config Next.js actually loads — .mjs is resolved before .ts. A stale
    // next.config.ts held the good headers but was never applied; it has been
    // removed and its CSP/HSTS set merged here so production pages actually
    // get them.
    //
    // CSP is a deliberately permissive starting policy ('unsafe-inline' /
    // 'unsafe-eval' in script-src) — tighten with a nonce once the inline
    // JSON-LD scripts in app/layout.tsx are nonce'd. Allowlist: Vercel
    // Insights, PostHog, Stripe.js, Supabase, Anthropic, OpenAI, Sentry.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel-insights.com https://*.posthog.com https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://api.anthropic.com https://api.openai.com https://*.vercel-insights.com https://*.posthog.com https://*.sentry.io https://*.ingest.sentry.io https://api.stripe.com",
      // 'self' on frame-src + frame-ancestors lets the Ask AI Source Preview
      // embed the same-origin /api/documents/:id/preview PDF iframe. Third-
      // party clickjacking is still blocked because no other origins are
      // allowed to frame us.
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; ')

    const baseSecurityHeaders = [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      // SAMEORIGIN (not DENY) matches the frame-ancestors 'self' CSP above and
      // lets in-app iframes (Source Preview, document viewer) load. We can't
      // override this per-route via next.config: Next.js merges headers from
      // all matching rules with last-rule-wins, so a more-specific override
      // listed earlier loses to /:path* listed after it. Setting SAMEORIGIN
      // globally is simpler and equally safe — only our own pages can frame
      // our pages.
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), payment=()' },
    ]

    return [
      {
        source: '/:path*',
        headers: baseSecurityHeaders,
      },
    ]
  },
}

export default nextConfig
