import type { Metadata } from 'next'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { AboutPage } from '@/components/marketing/vite/AboutPage'

export const metadata: Metadata = {
  title: 'About — Built by pilots and mechanics',
  description:
    'Meet the team building myaircraft.us — pilots, A&Ps, and AI engineers turning aircraft records into searchable intelligence.',
  alternates: { canonical: 'https://www.myaircraft.us/about' },
  openGraph: {
    title: 'About myaircraft.us',
    description: 'Pilots, mechanics, and AI engineers building the records-intelligence layer for general aviation.',
    url: 'https://www.myaircraft.us/about',
    siteName: 'myaircraft.us',
    type: 'website',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About myaircraft.us',
    description: 'Pilots, mechanics, and AI engineers building the records-intelligence layer for general aviation.',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
}

export default function Page() {
  return (
    <PublicLayout>
      <AboutPage />
    </PublicLayout>
  )
}
