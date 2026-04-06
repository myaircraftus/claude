import type { Metadata } from 'next'
import './globals.css'

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
