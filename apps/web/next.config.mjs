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
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
      {
        source: '/api/documents/:id/preview',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ]
  },
}

export default nextConfig
