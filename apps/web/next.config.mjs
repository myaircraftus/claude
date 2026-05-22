/** @type {import('next').NextConfig} */
// BUILD_BUSTER 2026-05-02T15:33Z — Vercel was serving a pre-Phase-1.1 build that
// rewrote /scheduler /time-off /clock /compliance /tools /inspections /vendors
// /meters /inbox to /dashboard. This comment exists to invalidate the build
// cache and force a clean rebuild from origin/main HEAD.
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      '@trigger.dev/sdk',
      'puppeteer-core',
      '@sparticuz/chromium',
      'pdfjs-dist',
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
      // Keep optional PDF-render deps external — installed on demand only.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'puppeteer-core',
        '@sparticuz/chromium',
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
