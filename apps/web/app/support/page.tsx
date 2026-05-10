/**
 * /support — Phase 16 Sprint 16.2 public ticket submit form.
 *
 * Marketing-site surface: anyone (including unauth) can submit a
 * support ticket. Posts to /api/public/support/submit; on success
 * shows the ticket_number + a magic link to view the thread without
 * logging in.
 */
import type { Metadata } from 'next'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { SupportForm } from './support-form'

export const metadata: Metadata = {
  title: 'Support · aircraft.us',
  description:
    'Get help from the aircraft.us team. Submit a ticket and AI will triage and reply within minutes.',
  alternates: { canonical: 'https://www.myaircraft.us/support' },
}

export default function SupportPage() {
  return (
    <PublicLayout>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="space-y-3 mb-10">
          <h1 className="text-4xl tracking-tight" style={{ fontWeight: 700 }}>
            Get help
          </h1>
          <p className="text-[15px] text-muted-foreground">
            Send us a ticket. AI triages every message — most simple questions
            (&ldquo;how do I reset my password&rdquo;, &ldquo;how does pricing work&rdquo;) get a
            same-minute reply. Anything more complex routes to a human within the
            SLA window for the issue&rsquo;s priority.
          </p>
        </div>
        <SupportForm />
      </main>
    </PublicLayout>
  )
}
