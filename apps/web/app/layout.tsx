import type { Metadata } from 'next'
import './globals.css'
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/search/lib/styles/index.css'

export const metadata: Metadata = {
  title: {
    default: 'myaircraft.us — Ask your aircraft anything',
    template: '%s | myaircraft.us',
  },
  description:
    'Aviation-specific AI records intelligence platform. Upload logbooks, POHs, maintenance manuals, and get citation-backed answers from your own records.',
  keywords: ['aircraft', 'aviation', 'logbook', 'maintenance', 'AI', 'FAA', 'records'],
  openGraph: {
    title: 'myaircraft.us',
    description: 'Ask your aircraft anything. Get answers from your own records.',
    url: 'https://www.myaircraft.us',
    siteName: 'myaircraft.us',
    type: 'website',
    images: [{ url: '/opengraph-image' }],
  },
  icons: {
    icon: '/redesign/MY_AIRCRAFT_LOGO.svg',
    shortcut: '/redesign/MY_AIRCRAFT_LOGO.svg',
    apple: '/redesign/MY_AIRCRAFT_LOGO.svg',
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

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
        />
        {children}
      </body>
    </html>
  )
}
