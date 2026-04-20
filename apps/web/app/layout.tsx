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
    url: 'https://myaircraft.us',
    siteName: 'myaircraft.us',
    type: 'website',
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
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
