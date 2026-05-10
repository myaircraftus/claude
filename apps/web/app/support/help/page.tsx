/**
 * /support/help — Phase 16 Sprint 16.10 knowledge base.
 *
 * Auto-built from resolved support tickets where AI provided a useful
 * answer (ai_response_count > 0 AND resolution_summary is set). Admin
 * curation gate via tags ('kb_published') for v2 — for now we surface
 * everything that meets the heuristic.
 *
 * Search-first layout. Categorized chips. "This didn't help — open
 * ticket" CTA at the bottom.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, BookOpen, MessageCircle, ChevronRight } from 'lucide-react'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { createServiceSupabase } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Help · aircraft.us',
  description: 'Answers from previously resolved support tickets. Searchable knowledge base.',
  alternates: { canonical: 'https://www.myaircraft.us/support/help' },
}

interface SearchParams {
  q?: string
  category?: string
}

interface KbEntry {
  ticket_number: string
  subject: string
  body: string
  category: string
  resolution_summary: string | null
  resolved_at: string | null
  tags: string[]
}

const CATEGORY_LABELS: Record<string, string> = {
  technical: 'Technical',
  billing: 'Billing',
  account: 'Account',
  feature_request: 'Features',
  bug: 'Known issues',
  other: 'Other',
}

export default async function HelpPage({ searchParams }: { searchParams: SearchParams }) {
  const service = createServiceSupabase()

  let query = service
    .from('support_tickets')
    .select('ticket_number, subject, body, category, resolution_summary, resolved_at, tags')
    .eq('status', 'resolved')
    .gt('ai_response_count', 0)
    .not('resolution_summary', 'is', null)
    .is('deleted_at', null)
    .order('resolved_at', { ascending: false })
    .limit(50)

  if (searchParams.category && CATEGORY_LABELS[searchParams.category]) {
    query = query.eq('category', searchParams.category)
  }
  if (searchParams.q?.trim()) {
    const term = searchParams.q.replace(/[%_]/g, '\\$&')
    query = query.or(`subject.ilike.%${term}%,body.ilike.%${term}%,resolution_summary.ilike.%${term}%`)
  }

  let entries: KbEntry[] = []
  try {
    const { data } = await query
    entries = (data ?? []) as KbEntry[]
  } catch {
    entries = []
  }

  const categories = Object.entries(CATEGORY_LABELS)

  return (
    <PublicLayout>
      <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl tracking-tight" style={{ fontWeight: 700 }}>Help</h1>
          <p className="text-sm text-muted-foreground">
            Answers built from previously resolved tickets. If your question isn&rsquo;t here, {' '}
            <Link href="/support" className="text-primary hover:underline">open a ticket</Link>
            {' '}— AI triages and most simple questions get a same-minute reply.
          </p>
        </div>

        <form className="rounded-2xl border border-border bg-white p-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="Search resolved tickets…"
            className="flex-1 rounded-lg border-0 bg-transparent px-2 py-1 text-sm focus:outline-none"
          />
          <select
            name="category"
            defaultValue={searchParams.category ?? ''}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">All categories</option>
            {categories.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90">
            Search
          </button>
        </form>

        {entries.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              {searchParams.q || searchParams.category
                ? 'No matching answers in the knowledge base yet.'
                : 'The knowledge base is still being seeded — check back as more tickets resolve.'}
            </p>
            <Link
              href={`/support${searchParams.q ? `?subject=${encodeURIComponent(searchParams.q)}` : ''}`}
              className="mt-4 inline-flex items-center gap-1 rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-muted/40"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Open a ticket
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => (
              <li key={e.ticket_number} className="rounded-2xl border border-border bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 capitalize">
                        {CATEGORY_LABELS[e.category] ?? e.category}
                      </span>
                      <p className="font-mono text-[11px] text-muted-foreground">{e.ticket_number}</p>
                    </div>
                    <h3 className="mt-2 text-base" style={{ fontWeight: 600 }}>{e.subject}</h3>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{e.body}</p>
                    {e.resolution_summary && (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                        <span style={{ fontWeight: 600 }}>How we resolved it:</span> {e.resolution_summary}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm" style={{ fontWeight: 600 }}>This didn&rsquo;t help?</p>
          <p className="mt-1 text-sm text-amber-900">
            <Link href="/support" className="text-amber-900 underline">Open a ticket</Link>
            {' '}and we&rsquo;ll get back to you within the SLA window for your tier.
          </p>
        </div>
      </main>
    </PublicLayout>
  )
}
