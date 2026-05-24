import type { MetadataRoute } from 'next'

/**
 * Web App Manifest — enables "Add to Home Screen" on iOS Safari + Chrome
 * Android, PWA install prompt on supported browsers, and proper iOS/Android
 * standalone-app rendering.
 *
 * Served at /manifest.webmanifest. Referenced from <head> via
 * Metadata.manifest in app/layout.tsx.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'myaircraft.us — Aircraft Records Intelligence',
    short_name: 'myaircraft.us',
    description:
      'AI-powered aircraft records intelligence for owners and A&P mechanics. Upload logbooks, POHs, maintenance manuals. Ask anything. Get citation-backed answers in seconds.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0A1628',
    theme_color: '#0A1628',
    orientation: 'portrait-primary',
    categories: ['business', 'productivity', 'utilities'],
    lang: 'en-US',
    dir: 'ltr',
    icons: [
      {
        // Same generator as /apple-icon (180×180 brand mark)
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // The dynamic /icon route (32×32) doubles as a small icon for
        // browsers and the OS task switcher.
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
