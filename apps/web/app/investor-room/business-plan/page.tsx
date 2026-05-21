/**
 * Business plan — read like a memo, not a deck. 7-page narrative
 * covering company, market, product, GTM, model, financials, team.
 */
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PrintButton } from '@/components/investor/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Business plan | Investor Room' }

export default function BusinessPlanPage() {
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

      <article className="prose prose-slate prose-headings:tracking-tight prose-h1:text-3xl prose-h2:text-xl prose-h2:mt-10 prose-h3:text-base prose-a:text-violet-700 max-w-none">
        <header className="mb-6 pb-4 border-b border-slate-200">
          <div className="text-[10px] uppercase tracking-[0.18em] text-violet-700 font-semibold">
            Confidential business plan
          </div>
          <h1>myaircraft.us — the maintenance OS for general aviation</h1>
          <p className="text-sm text-slate-500">
            Prepared by Andy Patel · andy@horf.us · Revised 2026
          </p>
        </header>

        <h2>1. Executive summary</h2>
        <p>
          myaircraft.us is a vertical SaaS for general-aviation maintenance shops and
          the aircraft owners they serve. A typical Part 91 or Part 145 maintenance
          provider today runs on a stack of paper logbooks, Excel spreadsheets, and
          QuickBooks. We replace that stack with a tenant-isolated, FAA-compliant
          system of record that captures every work order, every signed logbook
          entry, every owner approval — and an AI query engine that lets anyone in
          the shop or the owner ask plain-English questions and get cited answers.
        </p>
        <p>
          We are raising a <strong>$2.5M seed</strong> on a $15M post-money cap to fund
          18 months of runway with the milestones: 50 paying shops, SOC2 Type II
          audit complete, marketplace v1 live, and the iOS PWA owner app shipped.
        </p>

        <h2>2. The opportunity</h2>
        <p>
          The US general-aviation fleet is 220,000+ active aircraft. Each carries a
          paper logbook the FAA requires to be retained for the life of the
          aircraft. A typical shop services 8-30 aircraft and spends 15-25% of staff
          time on paperwork that adds no value to either party. Owners — most of
          whom are sophisticated buyers — have no real-time visibility into their
          own maintenance history, and pre-purchase buyers can&apos;t verify a
          listing&apos;s claims without flying out to scan the binder.
        </p>
        <p>
          The category is structurally similar to where dental, legal, and
          accounting SaaS were in 2014 — large incumbent share of analog
          process, regulatory depth that scares off horizontal players, a
          relationship-driven SMB buyer, and an emerging willingness to pay for
          purpose-built software. We estimate the US-only TAM at <strong>$20B</strong>{' '}
          in annual maintenance spend with software penetration under 15%.
          Bottoms-up: 7,500 shops × $36K avg ACV at our middle tier ={' '}
          <strong>$270M annual SaaS SAM</strong> at full SMB capture.
        </p>

        <h2>3. The product</h2>
        <p>
          What ships today:
        </p>
        <ul>
          <li>
            <strong>Multi-tenant platform</strong> — Next.js + Supabase Postgres with row-level
            security enforced at the database layer (not just application code). Every
            cross-tenant query is impossible by Postgres policy.
          </li>
          <li>
            <strong>Shop side</strong> — work orders, estimates, parts inventory, time tracking,
            invoices, logbook entries with IA e-signatures, FAA-aligned status models.
          </li>
          <li>
            <strong>Owner portal</strong> — approve estimates, pay invoices via Stripe, see signed
            logbook entries, ask AI questions scoped to the owner&apos;s own records.
          </li>
          <li>
            <strong>AI Query Engine</strong> — hybrid retrieval (vector + BM25 + PageIndex tree +
            ColQwen2 vision) with Cohere Rerank v3.5 and grounded GPT-4o synthesis with
            inline citations. Temperature=0 + LRU cache for same-question determinism.
          </li>
          <li>
            <strong>15-SOP knowledge base</strong> with a dynamic AI Simulator and SOC2 control
            matrix mapped against 27 trust criteria — the auditor-facing deliverable
            ships as part of the platform, not as a one-off PDF.
          </li>
        </ul>
        <p>
          The 12-month roadmap is documented in slide 11 of the pitch deck and at{' '}
          <Link href="/sop-library/13-fullstack-architecture-rag-admin">SOP-13 §18</Link>.
        </p>

        <h2>4. Go-to-market</h2>
        <p>
          Sales is direct to SMB shops in phase 1. Channel is regional GA conferences
          (AOPA Summit, EAA AirVenture, type-club gatherings) plus founding-tenant
          referrals. ACV is in the $36K range at our 10-aircraft middle tier, which is
          well below the budget threshold that triggers a procurement process — most
          owners can buy on a credit card.
        </p>
        <p>
          Owner portal is the network effect. A shop using myaircraft.us makes its
          owners portal-native — when an owner takes their aircraft to a second shop,
          they bring the portal with them, which becomes a pull marketing motion for
          the next shop. We are explicitly building this dynamic into the data model:
          the owner&apos;s account is portable across shops.
        </p>
        <p>
          Marketplace is the third leg — owners who list aircraft for sale carry their
          maintenance history with them. The listing is more valuable because the
          history is verifiable; the platform earns a 2.5% take rate on the sale and a
          $99 records-access fee per buyer.
        </p>

        <h2>5. Business model</h2>
        <p>
          Primary revenue is a per-aircraft SaaS subscription at $300/month, with
          bundled tiers at 5-aircraft / 20-aircraft / unlimited. Margin is{' '}
          <strong>85%+</strong> at scale (pure SaaS COGS — Vercel + Supabase + AI vendor
          fees). Target <strong>CAC payback under 6 months</strong>, supported by the
          inbound flywheel of owner referrals.
        </p>
        <p>
          Secondary lines:
        </p>
        <ul>
          <li>Marketplace take rate (2.5%) on facilitated aircraft sales</li>
          <li>Records-access fee ($99) on buyer pulls of maintenance history packets</li>
          <li>White-label tier for type-club partners (Cirrus Owners, COPA, ABS) and franchise MRO networks — priced as a six-figure annual contract</li>
        </ul>

        <h2>6. Competition</h2>
        <p>
          The competitive set splits into three buckets:
        </p>
        <ul>
          <li>
            <strong>Enterprise MRO software</strong> — CAMP, Flightdocs, EBis, AvPro. Powerful,
            built for corporate fleet and 121 ops, priced for 25M+ ACV. Doesn&apos;t
            fit an SMB shop.
          </li>
          <li>
            <strong>Adjacent-vertical SaaS</strong> — ShopMonkey, Tekmetric, Mitchell 1. Wrong
            regulatory model; no FAA logbook concept; their data shape doesn&apos;t map
            to aircraft.
          </li>
          <li>
            <strong>The incumbent</strong> — Excel + QuickBooks + paper. ~90% of the SMB GA
            shops we&apos;ve interviewed. The actual job to be done is to displace this
            stack, and the right unit economics fall out of pricing relative to the
            paper-process cost (not relative to enterprise software).
          </li>
        </ul>

        <h2>7. Team and operating plan</h2>
        <p>
          Andy Patel is the founder and currently full-stack — pilot, A330 engineering
          background, ten years building product, code shipped daily on Vercel
          production. The pre-seed has been bootstrapped; the build is real
          (production tenant onboarded, 67 documents indexed, 25,000+ embeddings,
          owner portal live, AI Query Engine live).
        </p>
        <p>
          Use of funds in the seed:
        </p>
        <ul>
          <li>
            <strong>55%</strong> engineering hires — 2 senior software engineers + 1 founding
            mechanic-in-residence (A&P certified, embedded in the build to keep the
            regulatory model honest)
          </li>
          <li><strong>25%</strong> GTM — events, partnerships, content, founding sales rep</li>
          <li><strong>10%</strong> SOC2 Type II audit + penetration test (RamSec / Drata equiv.)</li>
          <li><strong>10%</strong> reserve / opportunistic</li>
        </ul>

        <h2>8. Financials and unit economics</h2>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Year 1</th>
              <th>Year 2</th>
              <th>Year 3</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Paying shops</td>
              <td>50</td>
              <td>200</td>
              <td>500</td>
            </tr>
            <tr>
              <td>Active aircraft</td>
              <td>500</td>
              <td>2,200</td>
              <td>6,000</td>
            </tr>
            <tr>
              <td>ARR (SaaS)</td>
              <td>$1.8M</td>
              <td>$7.9M</td>
              <td>$22M</td>
            </tr>
            <tr>
              <td>Marketplace GMV</td>
              <td>$0</td>
              <td>$8M</td>
              <td>$60M</td>
            </tr>
            <tr>
              <td>Gross margin</td>
              <td>~75%</td>
              <td>~82%</td>
              <td>~85%</td>
            </tr>
          </tbody>
        </table>
        <p>
          These are author-prepared, bottoms-up projections — not committed forecasts.
          Sensitivity analysis is in the data room.
        </p>

        <h2>9. Risks and mitigations</h2>
        <ul>
          <li>
            <strong>Regulatory risk</strong> — FAA reinterpretation of recordkeeping rules.
            Mitigation: every regulatory anchor (§43, §65, §91.417) is documented in SOP-7;
            we keep an A&P advisor on retainer; we don&apos;t replace the paper logbook,
            we keep it as the secondary system of record until the FAA blesses
            full digital.
          </li>
          <li>
            <strong>Incumbent expansion risk</strong> — enterprise MRO vendors move down-market.
            Mitigation: speed of execution; owner-side network effect; SMB price point that
            doesn&apos;t fit their cost structure.
          </li>
          <li>
            <strong>AI cost risk</strong> — provider price changes erode margin. Mitigation: AI
            cost is &lt;5% of revenue today; provider-agnostic model interface; rerank cache
            cuts the most expensive call materially on warm tenants.
          </li>
          <li>
            <strong>Security risk</strong> — a tenant data breach would be catastrophic in
            this market. Mitigation: defense in depth (RLS at DB + middleware auth + API
            input validation + audit log); SOC2 Type II in progress; immutable approval
            evidence on every owner action.
          </li>
        </ul>

        <h2>10. The ask</h2>
        <p>
          $2.5M seed. $15M post-money cap. 18 months runway. Lead-investor profile:
          vertical SaaS or regulated-industry experience. Strategic angels welcome
          (GA owners, type-club presidents, ex-MRO operators).
        </p>
        <p>
          Investor Room (this site) has the pitch deck, data room, KPIs, team page,
          and an FAQ covering the questions every investor asks. Pitch deck is at{' '}
          <Link href="/investor-room/pitch">/investor-room/pitch</Link>; the data room at{' '}
          <Link href="/investor-room/data-room">/investor-room/data-room</Link>.
        </p>

        <footer className="mt-10 pt-6 border-t border-slate-200 text-[11px] text-slate-500">
          Confidential — do not distribute. Andy Patel · andy@horf.us · 2026.
        </footer>
      </article>
    </div>
  )
}
