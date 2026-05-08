import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@trigger.dev/sdk', 'pdfjs-dist'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve = config.resolve ?? {}
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        canvas: false,
      }
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
  async headers() {
    // ─── Content-Security-Policy ─────────────────────────────────────────
    // Permissive starting policy per security-audit.md §5.13. Tighten by
    // narrowing 'unsafe-inline' / 'unsafe-eval' once the inline JSON-LD
    // scripts in app/layout.tsx + app/blog/[slug] use a nonce, and once
    // any remaining `new Function`-style code paths (motion/react was
    // checked clean during the audit) are confirmed gone.
    //
    // Allowlist breakdown:
    //   script-src adds vercel-insights, posthog (analytics), js.stripe.com
    //              (loadStripe in components/billing/AddPaymentMethodButton).
    //   connect-src adds supabase, anthropic, openai (server-side only,
    //              but client-side code may proxy in future), posthog,
    //              *.sentry.io + *.ingest.sentry.io (Sentry SDK posts
    //              events client-side), api.stripe.com (Stripe.js SDK
    //              calls when collecting payment methods),
    //              vercel-insights (Vercel Web Analytics beacon).
    //   frame-src whitelists Stripe Checkout + Stripe.js iframe (for
    //              SetupIntent / Element flows). Otherwise frame-src
    //              defaults to default-src ('self').
    //   frame-ancestors 'none' — clickjacking defense (matches the
    //              global X-Frame-Options: DENY below).
    //   form-action 'self' — block external form posts (csrf hardening).
    //   object-src 'none' — kill <object>/<embed> Flash-style attack
    //              surface entirely.
    //   base-uri 'self' — prevent <base href> hijacks.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel-insights.com https://*.posthog.com https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://api.anthropic.com https://api.openai.com https://*.vercel-insights.com https://*.posthog.com https://*.sentry.io https://*.ingest.sentry.io https://api.stripe.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; ')

    // Headers applied to every route. The global X-Frame-Options is DENY
    // (modern equivalent of frame-ancestors 'none'); path-specific rules
    // below override DENY → SAMEORIGIN where the app intentionally
    // iframe-embeds its own content (PDF preview).
    const baseSecurityHeaders = [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), payment=()' },
    ]

    return [
      // Path-specific override: /api/documents/:id/preview returns PDFs
      // that the app embeds in <iframe>s for in-app preview. SAMEORIGIN
      // is required so the iframe loads from the same myaircraft.us host.
      // This entry is BEFORE the global match so Next picks it first.
      {
        source: '/api/documents/:id/preview',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // Global default — every other route gets the full security header set.
      {
        source: '/:path*',
        headers: baseSecurityHeaders,
      },
    ]
  },
}

export default nextConfig
