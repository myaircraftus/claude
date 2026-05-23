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
  keywords: [
    'aircraft logbook software',
    'aviation maintenance tracking',
    'AD compliance',
    'A&P mechanic tools',
    'aircraft records AI',
    'logbook scanning',
    'FAA records',
    'annual inspection software',
    '100-hour inspection',
  ],
  metadataBase: new URL('https://www.myaircraft.us'),
  alternates: { canonical: 'https://www.myaircraft.us' },
  openGraph: {
    title: 'myaircraft.us — AI-powered aircraft records intelligence',
    description:
      'Upload your logbooks, POHs and maintenance manuals. Ask anything. Get citation-backed answers in seconds.',
    url: 'https://www.myaircraft.us',
    siteName: 'myaircraft.us',
    type: 'website',
    locale: 'en_US',
    images: [{ url: '/opengraph-image' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'myaircraft.us — AI-powered aircraft records intelligence',
    description:
      'Upload your logbooks, POHs and maintenance manuals. Ask anything. Get citation-backed answers in seconds.',
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' },
  },
  authors: [{ name: 'Andy Patel' }],
  category: 'aviation maintenance software',
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
    operatingSystem: 'Web, iOS, Android',
    description:
      'AI-powered aircraft records intelligence platform for owners, A&P mechanics, and IAs. Logbook scanning, AD compliance tracking, work-order management, and citation-backed AI search across every record on file.',
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
