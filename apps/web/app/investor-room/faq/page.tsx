/**
 * Investor FAQ — the questions every investor asks, answered honestly.
 *
 * Organized by category so a fast-reading partner can scan the bolded
 * questions and only read the answers they care about.
 */
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PrintButton } from '@/components/investor/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'FAQ | Investor Room' }

interface QA {
  q: string
  a: string | React.ReactNode
}

const SECTIONS: Array<{ title: string; items: QA[] }> = [
  {
    title: 'Why now',
    items: [
      {
        q: 'Why didn\'t this exist already?',
        a: (
          <>
            It mostly didn&apos;t exist because the enterprise MRO software vendors
            (CAMP, Flightdocs, EBis) priced themselves out of the SMB GA shop and the
            adjacent-vertical SaaS vendors (ShopMonkey, Tekmetric) don&apos;t know
            14 CFR §43 from a hole in the ground. The middle was empty. The middle is
            also where 90% of the shops live.
          </>
        ),
      },
      {
        q: 'Why is the timing right?',
        a: (
          <>
            Three things. (1) The FAA has been blessing digital recordkeeping more
            aggressively since 2023 — the regulatory tailwind is real. (2) RAG and
            grounded LLMs got good enough in 2024 that "ask my logbook a question"
            now works with citations. (3) SMB shops are aging out of QuickBooks +
            Excel — the operators are warming to software in a way they weren&apos;t
            five years ago.
          </>
        ),
      },
      {
        q: 'How big can this get?',
        a: (
          <>
            US-only TAM is $20B/yr in maintenance spend with software penetration
            under 15%. Bottoms-up SAM at our ACV is $270M annual SaaS. Adjacent
            marketplace revenue (2.5% on facilitated sales) adds another nine-figure
            line at scale. Global multiplier is ~3x. The honest answer: this is a
            big company outcome if we execute, not a $100M cap exit.
          </>
        ),
      },
    ],
  },
  {
    title: 'Product & moat',
    items: [
      {
        q: 'What stops a CAMP or Flightdocs from doing this themselves?',
        a: (
          <>
            Two things. (1) Their cost structure won&apos;t let them serve a
            10-aircraft shop profitably — they need enterprise ACV to fund the sales
            cycles they&apos;re used to. (2) Their data shape is wrong for the
            owner-facing portal motion that&apos;s the network effect here. They
            could of course build it; we just have a 24-month head start and a
            different cost basis.
          </>
        ),
      },
      {
        q: 'What\'s your real moat?',
        a: (
          <>
            Regulatory depth + closed-loop data + AI grounding. Each one alone is a
            "feature." Together they&apos;re a substrate. Once a shop&apos;s history
            is digitized, switching cost is the FAA-mandated retention obligation —
            we get years to monetize. The marketplace flywheel layers on top.
          </>
        ),
      },
      {
        q: 'Aren\'t the AI features just GPT wrappers?',
        a: (
          <>
            The system prompt is 30 lines. The retrieval pipeline is hundreds — hybrid
            vector + BM25 + PageIndex tree + vision (ColQwen2) + Cohere rerank with
            an LRU cache for same-question determinism. The "GPT wrapper" gets the
            same evidence we give the LLM and writes the same words; the value lives
            in what evidence we surface, scoped to the asker&apos;s tenant. See{' '}
            <Link href="/sop-library/13-fullstack-architecture-rag-admin#8-ai-rag-query-engine">
              SOP-13 §8
            </Link>{' '}
            for the full engine.
          </>
        ),
      },
    ],
  },
  {
    title: 'GTM',
    items: [
      {
        q: 'How do you get the first 10 shops?',
        a: (
          <>
            Three motions running in parallel. (1) Founding-tenant referrals — the
            shop owners who use the product talk to other shop owners. (2) Regional GA
            conferences and type-club gatherings. (3) Direct sales by the founder
            until the GTM lead joins. We&apos;re aiming for $0 acquisition cost on
            the first 10 and a measured CAC on the next 40.
          </>
        ),
      },
      {
        q: 'What\'s the owner-portal network effect?',
        a: (
          <>
            Every shop tenant&apos;s owners get a portal. When an owner takes their
            aircraft to a second shop (for a pre-buy inspection, a heavy 100-hour,
            etc.), they bring the portal with them — that second shop is then
            warmed up to us as "the platform my client already uses." Owner-side pull
            becomes a shop-side acquisition channel.
          </>
        ),
      },
      {
        q: 'How defensible is the marketplace?',
        a: (
          <>
            The marketplace is downstream of the SaaS — every aircraft listed for
            sale ships with a verifiable digital maintenance history. A listing on
            our platform is worth more than a listing on Controller because the
            buyer can verify it without a pre-buy inspection round-trip. The take
            rate (2.5%) is below standard for the category. Defensibility comes
            from the data, not from the listing UX.
          </>
        ),
      },
    ],
  },
  {
    title: 'Numbers',
    items: [
      {
        q: 'What\'s your current ARR?',
        a: (
          <>
            Live ARR is in the data room (NDA). Founding tenant is on a free pilot
            converting to paid at seed close. We are not pretending to have material
            revenue today — we are pretending to have a product that works, which
            we do. The investor thesis is on the next 18 months of execution
            against a real product, not on the trailing P&L.
          </>
        ),
      },
      {
        q: 'CAC payback target?',
        a: (
          <>
            Under 6 months for direct-sales shops; we expect that to fall to under 3
            months once the owner-portal pull motion takes hold in year 2. Pricing
            ($300/mo per managed aircraft) is anchored to displaced paper-process
            cost, not enterprise-software cost — which is why payback is fast.
          </>
        ),
      },
      {
        q: 'Gross margin?',
        a: (
          <>
            ~75% in year 1 (AI cost over-indexed against early revenue), trending to
            85%+ at scale. AI cost is &lt;5% of revenue today; the rerank cache and
            the provider-agnostic interface insulate us from provider price moves.
          </>
        ),
      },
    ],
  },
  {
    title: 'Security & compliance',
    items: [
      {
        q: 'Are you SOC2 compliant?',
        a: (
          <>
            SOC2 Type II in progress. 27 trust criteria are mapped to specific
            controls and SOP evidence today; auditor-facing matrix is at{' '}
            <Link href="/sop-library/compliance">/sop-library/compliance</Link>. Audit
            firm engagement is scheduled into the use-of-funds line; pen test is on
            the same timeline.
          </>
        ),
      },
      {
        q: 'How do you handle multi-tenancy?',
        a: (
          <>
            Row-level security enforced at Postgres, not in application code. Every
            policy is documented in{' '}
            <Link href="/sop-library/13-fullstack-architecture-rag-admin#4-multi-tenancy-architecture">
              SOP-13 §4
            </Link>
            . Cross-tenant queries are impossible by Postgres policy — not by
            application-layer good intentions. We test this with a synthetic
            tenant-isolation suite that runs on every deploy.
          </>
        ),
      },
      {
        q: 'What if there\'s a breach?',
        a: (
          <>
            Incident-response runbook is{' '}
            <a
              href="https://github.com/myaircraftus/claude/blob/main/docs/incident-response-runbook.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-700"
            >
              public on the repo
            </a>
            . P0–P3 severity classification, security-incident playbook, post-mortem
            template. We don&apos;t pretend a breach is impossible — we pretend
            we&apos;re ready when one happens.
          </>
        ),
      },
    ],
  },
  {
    title: 'The deal',
    items: [
      {
        q: 'What are you raising?',
        a: '$2.5M seed on $15M post-money cap. 18 months runway. SAFE or priced — investor preference.',
      },
      {
        q: 'Who\'s the lead?',
        a: (
          <>
            Open. Looking for a vertical-SaaS investor with regulated-industry
            experience and a $250K–$1M check. Strategic angels welcome on the side
            (GA owners, type-club presidents, ex-MRO operators).
          </>
        ),
      },
      {
        q: 'What\'s the next milestone?',
        a: (
          <>
            50 paying shops, SOC2 Type II audit complete, marketplace v1 live, iOS
            PWA owner app shipped. Series A profile after that is a vertical-SaaS
            growth round, not a strategic outcome.
          </>
        ),
      },
    ],
  },
]

export default function FAQPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          href="/investor-room"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Investor Room
        </Link>
        <PrintButton />
      </div>

      <header className="mb-8 pb-5 border-b border-slate-200">
        <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-700 font-semibold mb-2">
          Investor FAQ
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
          The questions every investor asks.
        </h1>
        <p className="text-sm text-slate-600">
          Skim the bolded questions; read the ones you care about. If your question
          isn&apos;t here, email{' '}
          <a href="mailto:andy@horf.us" className="text-violet-700">
            andy@horf.us
          </a>
          .
        </p>
      </header>

      <div className="space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold mb-4">
              {section.title}
            </h2>
            <div className="space-y-5">
              {section.items.map((qa) => (
                <div
                  key={qa.q}
                  className="rounded-lg border border-slate-200 bg-white p-5"
                >
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">{qa.q}</h3>
                  <div className="text-sm text-slate-700 leading-relaxed">{qa.a}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-10 pt-6 border-t border-slate-200 text-[11px] text-slate-500">
        Confidential — do not distribute. Andy Patel · andy@horf.us · 2026.
      </footer>
    </div>
  )
}
