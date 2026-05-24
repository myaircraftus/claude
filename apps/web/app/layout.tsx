import type { Metadata, Viewport } from 'next'
import './globals.css'
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/search/lib/styles/index.css'

/**
 * Viewport + theme-color metadata. Next.js 14.2+ requires these in a
 * dedicated `viewport` export (not in the Metadata object) — otherwise
 * the framework logs a warning and the meta tags don't render.
 *
 * Theme color colors:
 *   - The mobile browser chrome bar (Safari iOS / Chrome Android)
 *   - The link-preview frame in iMessage / Slack on dark mode
 *   - The Windows MS-tile background when the site is pinned
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0A1628' },
    { media: '(prefers-color-scheme: dark)', color: '#0A1628' },
  ],
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: {
    default: 'myaircraft.us — Ask your aircraft anything',
    template: '%s | myaircraft.us',
  },
  description:
    'Aviation-specific AI records intelligence platform. Upload logbooks, POHs, maintenance manuals, and get citation-backed answers from your own records.',
  keywords: [
    // Core product
    'aircraft logbook software',
    'aviation maintenance tracking',
    'AD compliance',
    'A&P mechanic tools',
    'aircraft records AI',
    'logbook scanning',
    'FAA records',
    'annual inspection software',
    '100-hour inspection',
    // Competitor-displacement
    'CAMP alternative',
    'FlightDocs alternative',
    'Veryon alternative',
    'best aircraft maintenance software',
    // High-intent ownership queries
    'aircraft annual inspection cost',
    'aircraft pre-purchase inspection',
    'cost of aircraft ownership',
    'Cessna 172 maintenance cost',
    'Cessna 182 ADs',
    'FAR 91.409',
    'FAR 91.411',
    'FAR 91.413',
    'transponder check FAA',
    'pitot static check',
    // Workflow / persona
    'A&P shop software',
    'A&P work order software',
    'aircraft owner portal',
    'AI logbook reader',
    'aircraft pre-buy checklist',
  ],
  metadataBase: new URL('https://www.myaircraft.us'),
  alternates: { canonical: 'https://www.myaircraft.us' },
  openGraph: {
    title: 'myaircraft.us — AI-powered aircraft records intelligence',
    description:
      'Your aircraft\'s entire history — AI-readable, searchable, audit-proof. Upload logbooks, POHs, AD lists. Ask anything. Get citation-backed answers in seconds. Free for individual owners.',
    url: 'https://www.myaircraft.us',
    siteName: 'myaircraft.us',
    type: 'website',
    locale: 'en_US',
    // Explicit width/height help iMessage, WhatsApp, LinkedIn, Slack
    // size the link-preview card correctly. The Next.js generator
    // returns a 1200×630 PNG (the standard Facebook/Twitter card size).
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'myaircraft.us — AI-powered aircraft records intelligence for owners and A&P mechanics',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@myaircraftus',
    creator: '@myaircraftus',
    title: 'myaircraft.us — AI-powered aircraft records intelligence',
    description:
      'Your aircraft\'s entire history — AI-readable, searchable, audit-proof. Free for individual owners.',
    images: ['/opengraph-image'],
  },
  // iOS Safari "Add to Home Screen" / iMessage link previews on iPhone
  // use these app-specific meta tags alongside og:image.
  appleWebApp: {
    capable: true,
    title: 'myaircraft.us',
    statusBarStyle: 'black-translucent',
  },
  manifest: '/manifest.webmanifest',
  other: {
    // MS-tile color for Windows pinned-tile icons.
    'msapplication-TileColor': '#0A1628',
    // Twitter dnt + content-discovery flags (no harm if Twitter ignores).
    'twitter:domain': 'myaircraft.us',
    'twitter:label1': 'Best for',
    'twitter:data1': 'Aircraft owners + A&P shops',
    'twitter:label2': 'Pricing',
    'twitter:data2': 'Free for individual owners',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' },
  },
  authors: [{ name: 'Andy Patel' }],
  category: 'aviation maintenance software',
  // Icons are now auto-discovered from app/icon.tsx (32×32 favicon) and
  // app/apple-icon.tsx (180×180 Apple touch icon). The SVG logo is still
  // referenced as a fallback for browsers that prefer SVG icons.
  icons: {
    icon: [
      { url: '/icon', type: 'image/png', sizes: '32x32' },
      { url: '/redesign/MY_AIRCRAFT_LOGO.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icon',
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  },
  verification: {
    // Google Search Console URL-prefix property verification for
    // https://www.myaircraft.us/ (registered under andy@horf.us).
    // Next.js renders this as <meta name="google-site-verification" />.
    google: 'FFbICRGhzRpheoR3ulWkydsJUpxx0KKgn7t4GMV2O24',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'myaircraft.us',
    url: 'https://www.myaircraft.us',
    logo: 'https://www.myaircraft.us/redesign/MY_AIRCRAFT_LOGO.svg',
    sameAs: [],
    description: 'AI-powered aircraft records management for owners and A&P mechanics.',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@myaircraft.us',
    },
  }
  // WebSite schema enables Google's sitelinks search box for branded
  // queries — users can search myaircraft.us directly from the SERP.
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'myaircraft.us',
    url: 'https://www.myaircraft.us',
    description: 'Ask your aircraft anything. AI-powered aviation records intelligence.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://www.myaircraft.us/blog?q={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  }
  // SoftwareApplication schema — eligible for Google's rich snippet on
  // "aviation maintenance software" SERPs and App-Pack on mobile.
  const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'myaircraft.us',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Aviation Maintenance Software',
    operatingSystem: 'Web, iOS, Android',
    description:
      'AI-powered aircraft records intelligence platform for owners, A&P mechanics, and IAs. Logbook scanning, AD compliance tracking, work-order management, and citation-backed AI search across every record on file.',
    featureList: [
      'AI logbook ingestion (PDF + scanned + handwritten)',
      'Citation-backed answers — every claim links to the source page',
      'FAA AD database auto-cross-checked against your tail',
      'Pre-buy / pre-annual digital checklist',
      'A&P work-order management with timer + checklist',
      'Owner ↔ mechanic chat in-app',
      'Calendar-month deadline tracking (91.409 / 91.411 / 91.413)',
    ],
    audience: {
      '@type': 'Audience',
      audienceType: 'Aircraft Owners and A&P Mechanics',
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free trial; paid plans on /pricing.',
    },
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
        />
        {children}
      </body>
    </html>
  )
}
