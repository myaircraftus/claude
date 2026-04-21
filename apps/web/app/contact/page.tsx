import type { Metadata } from 'next'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { ContactPage } from '@/components/marketing/vite/ContactPage'

export const metadata: Metadata = {
  title: 'Contact — Talk to the team',
  description:
    'Questions, scanning requests, or enterprise inquiries — reach the myaircraft.us team. We respond within one business day.',
  alternates: { canonical: 'https://www.myaircraft.us/contact' },
  openGraph: {
    title: 'Contact myaircraft.us',
    description: 'Questions, scanning requests, or enterprise inquiries. We respond within one business day.',
    url: 'https://www.myaircraft.us/contact',
    siteName: 'myaircraft.us',
    type: 'website',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact myaircraft.us',
    description: 'Questions, scanning requests, or enterprise inquiries. We respond within one business day.',
    images: ['/redesign/MY_AIRCRAFT_LOGO.svg'],
  },
}

export default function Page() {
  return (
    <PublicLayout>
      <ContactPage />
    </PublicLayout>
  )
}
