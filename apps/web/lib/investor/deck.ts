/**
 * Pitch-deck content.
 *
 * Kept as a TypeScript module (not markdown) so each slide can carry
 * structured fields — bullets, metric cards, chart hints, footnotes —
 * that render well both in the scrolling grid view AND in the
 * full-screen Present mode.
 *
 * Numbers in this deck are author-provided placeholders for the
 * fundraising-prep round. Update before sending to a real investor.
 *
 * Order matches the typical 14-16 slide seed/Series-A deck flow:
 * cover · problem · solution · market · product · moat · traction ·
 * GTM · model · competition · roadmap · team · ask · contact.
 */

export interface Slide {
  /** Slide number — 1-indexed. */
  n: number
  /** Short id for URL anchors (#problem, #traction). */
  id: string
  /** Short label shown in the deck navigator. */
  label: string
  /** Main title rendered prominently. */
  title: string
  /** Optional subtitle / one-liner under the title. */
  subtitle?: string
  /** Optional eyebrow tag (e.g., "01 · Problem"). */
  eyebrow?: string
  /** Bullet points — short, punchy. */
  bullets?: string[]
  /** Metric cards — big number + label. */
  metrics?: Array<{ value: string; label: string; sub?: string }>
  /** Mermaid diagram source (if applicable). */
  mermaid?: string
  /** Quote attribution block. */
  quote?: { text: string; attribution: string }
  /** Footnote / source citation. */
  footnote?: string
  /** Color theme: 'dark' = dark slide with white text; 'light' = white slide. */
  theme?: 'light' | 'dark' | 'accent'
}

export const DECK: Slide[] = [
  {
    n: 1,
    id: 'cover',
    label: 'Cover',
    eyebrow: 'Confidential · Pre-seed / Seed',
    title: 'myaircraft.us',
    subtitle:
      'The maintenance operating system for general aviation. A single source of truth from a shop\'s work order to an FAA-grade logbook entry — with AI that actually reads the records.',
    theme: 'dark',
    footnote: 'Andy Patel · andy@horf.us · 2026',
  },
  {
    n: 2,
    id: 'problem',
    label: 'Problem',
    eyebrow: '01 · Problem',
    title: 'GA maintenance runs on paper and Excel.',
    subtitle:
      'A $20B/yr industry where the system of record is a stack of three-ring binders in a hangar.',
    bullets: [
      '220,000+ active GA aircraft in the US — every one carries a paper logbook the FAA requires to be retained for the life of the aircraft.',
      '7,500+ Part 145 + Part 91 shops still use Excel, QuickBooks, and paper to run their entire operation.',
      'Owners can\'t see their own maintenance history. Buyers can\'t verify it. Shops re-do the same paperwork hundreds of times.',
      'When the FAA audits a shop, they want every entry, every signature, every AD compliance record. Today that\'s a binder hunt that costs days.',
    ],
    footnote: 'Source: FAA Civil Aviation Registry · AOPA 2025 GA Trends report',
    theme: 'light',
  },
  {
    n: 3,
    id: 'solution',
    label: 'Solution',
    eyebrow: '02 · Solution',
    title: 'One platform. Shop, owner, AI.',
    subtitle:
      'Replace the binder with a tenant-isolated, RLS-protected, AI-readable system of record — the same data, but queryable, signable, shareable, and FAA-compliant by design.',
    bullets: [
      'Shop side: work orders, estimates, parts, time tracking, logbook entries with IA e-signatures.',
      'Owner side: a portal that shows only what the shop chose to share — approvals, invoices, signed records, a Stripe pay button.',
      'AI side: ask any question in plain English ("when is my next annual due?", "what did the shop find in the magneto inspection?") and get a cited answer.',
      'FAA-compliant by design: 14 CFR §43 / §65 / §91 anchors are wired into the data model, not bolted on.',
    ],
    theme: 'light',
  },
  {
    n: 4,
    id: 'market',
    label: 'Market',
    eyebrow: '03 · Market',
    title: 'A $20B+ maintenance category, mid-digitized.',
    metrics: [
      { value: '220K', label: 'US GA aircraft', sub: 'FAA registry' },
      { value: '7.5K', label: 'Shops (Part 145+91)', sub: 'Avg 12 aircraft each' },
      { value: '$20B', label: 'US GA maintenance / yr', sub: 'Estimated, 2025' },
      { value: '$300/mo', label: 'Target ARPU', sub: 'Per active aircraft × shop' },
    ],
    bullets: [
      'TAM US only — $20B annual maintenance spend, software penetration < 15%.',
      'TAM global — multiply by ~3x for EASA + CAA + global GA fleets.',
      'Adjacent: marketplace transactions (aircraft sales / pre-buy inspections) — $4B+ annually.',
      'White-space target = SMB shops (5-30 staff) — too small for the big MRO software vendors, too big for spreadsheets.',
    ],
    footnote: 'Bottoms-up: 7,500 shops × $36K avg ACV = $270M SAM at full SMB capture',
    theme: 'light',
  },
  {
    n: 5,
    id: 'product',
    label: 'Product',
    eyebrow: '04 · Product',
    title: 'What\'s shipped today.',
    bullets: [
      'Multi-tenant Next.js + Supabase Postgres + pgvector + Cohere Rerank — runs on Vercel, region iad1.',
      '15-SOP knowledge base + dynamic AI Simulator. Every workflow has a written, versioned standard.',
      'Iron-Wall persona model — owner sees only what the shop shares; mechanic sees their assignments; admin sees everything.',
      'AI Query Engine — hybrid retrieval (vector + BM25 + PageIndex tree + ColQwen2 vision) + Cohere rerank + grounded GPT-4o synthesis with citations.',
      'Owner portal: estimate approval, invoice payment (Stripe), signed-logbook access, AI Q&A scoped to their own records.',
    ],
    metrics: [
      { value: '15', label: 'Live SOPs', sub: 'Source-of-truth manual' },
      { value: '67', label: 'Production docs', sub: '+25K embeddings indexed' },
      { value: '99.9%', label: 'Tenant-isolation tests', sub: 'RLS enforced + audited' },
    ],
    theme: 'light',
  },
  {
    n: 6,
    id: 'moat',
    label: 'Moat',
    eyebrow: '05 · Moat',
    title: 'The moat compounds with every record.',
    bullets: [
      'Regulatory depth — 14 CFR §43.9, §65.95, §91.417 wired into the data model. Most competitors don\'t even know what these are.',
      'Closed-loop data — once a shop\'s history is digitized, switching cost is the FAA-mandated retention obligation. We get years to monetize.',
      'AI grounding — every answer cites a chunk that lives in a tenant\'s own data; no model-training leakage, no hallucinated entries.',
      'Marketplace flywheel — owners who list aircraft on the marketplace bring their maintenance history with them, which makes the listing more valuable, which pulls more shops in.',
    ],
    theme: 'light',
  },
  {
    n: 7,
    id: 'traction',
    label: 'Traction',
    eyebrow: '06 · Traction',
    title: 'Where we are.',
    metrics: [
      { value: '67', label: 'Production docs', sub: 'On Horizon Flights tenant' },
      { value: '25K', label: 'Embeddings indexed', sub: 'Across logbooks + manuals' },
      { value: '106K', label: 'Tree nodes', sub: 'Hierarchical PageIndex' },
      { value: '16', label: 'AI training scenarios', sub: 'In the SOP Simulator' },
    ],
    bullets: [
      'Founding tenant (Horizon Flights) onboarded with 67 documents + full historical logbook backfill.',
      'AI Query Engine in production — same-question determinism after rerank-cache deployment.',
      'Owner Portal live (approvals, invoices, AI Q&A scoped to owner-visible records).',
      'SOC2 control matrix mapped against 27 trust criteria — pen-test scheduled.',
    ],
    theme: 'light',
  },
  {
    n: 8,
    id: 'gtm',
    label: 'GTM',
    eyebrow: '07 · Go-to-Market',
    title: 'Land the shop, expand through the owner.',
    bullets: [
      'Phase 1 (now): direct sales to SMB shops (5-30 staff) via AOPA / regional FAA conferences + word-of-mouth from the founding tenant.',
      'Phase 2: every shop\'s owner gets a portal — when they shop-shop, they bring the portal with them. Network effect.',
      'Phase 3: marketplace — listings include shareable maintenance history. Buyers pay records-access fee, owners get warm leads.',
      'Phase 4: white-label for type-club partners (Cirrus Owners, COPA, ABS), franchise-style MRO networks.',
    ],
    theme: 'light',
  },
  {
    n: 9,
    id: 'model',
    label: 'Business Model',
    eyebrow: '08 · Business model',
    title: 'Per-aircraft SaaS + marketplace take rate.',
    bullets: [
      'Primary SaaS — $300/mo per actively-managed aircraft × shop. Bundled tiers: 5-aircraft / 20 / unlimited.',
      'Owner portal — free to the owner (revenue model: included with shop ACV).',
      'Marketplace — 2.5% take rate on aircraft sale transactions facilitated through the platform.',
      'Records-access fee — $99 per buyer who pulls a full maintenance history packet for a listed aircraft.',
      'AI Simulator + SOC2 evidence — included; differentiator vs. legacy MRO tools.',
    ],
    metrics: [
      { value: '$36K', label: 'Avg shop ACV', sub: '10-aircraft tier' },
      { value: '85%', label: 'Gross margin', sub: 'Pure SaaS' },
      { value: '<6mo', label: 'Target payback', sub: 'CAC payback' },
    ],
    theme: 'light',
  },
  {
    n: 10,
    id: 'competition',
    label: 'Competition',
    eyebrow: '09 · Competition',
    title: 'Where we sit.',
    bullets: [
      'CAMP, Flightdocs, EBis — legacy MRO software, enterprise/corporate jets. Powerful but priced for 25M+ ACV; doesn\'t fit a 10-aircraft shop.',
      'ShopMonkey / Tekmetric — auto-shop SaaS. Wrong regulatory model; no FAA logbook concept.',
      'Excel + QuickBooks + paper — the actual incumbent for 90% of SMB GA shops. The job to be done is to replace this stack, not the enterprise vendors.',
      'Where we win: built for SMB GA from day one. Owner portal + AI baked in. FAA-grade logbook signatures, not an afterthought.',
    ],
    theme: 'light',
  },
  {
    n: 11,
    id: 'architecture',
    label: 'Architecture',
    eyebrow: '10 · Tech',
    title: 'How it\'s wired.',
    mermaid: `flowchart LR
  user[Owners · Mechanics · Admins]
  edge[Vercel Edge · Fluid Compute]
  app[Next.js App Router]
  sb[(Supabase Postgres 17<br/>RLS · pgvector · tsvector)]
  ai[OpenAI · Cohere · Anthropic-ready]
  pay[Stripe · Google DocAI · Sentry · PostHog]

  user --> edge --> app
  app --> sb
  app --> ai
  app --> pay`,
    bullets: [
      'SOC2 Type II posture mapped against 27 controls (see /sop-library/compliance).',
      'PII-isolated by tenant; cross-tenant data flow is impossible by Postgres policy, not by application code.',
      'Anthropic-ready: model interface is provider-agnostic; switching from GPT-4o → Claude → Gemini is a config change.',
    ],
    theme: 'light',
  },
  {
    n: 12,
    id: 'roadmap',
    label: 'Roadmap',
    eyebrow: '11 · Roadmap',
    title: '12 months out.',
    bullets: [
      'Q3 — 10 paying shops · marketplace beta · approval-evidence PDF snapshots · SOC2 Type II audit.',
      'Q4 — 25 shops · type-club partner pilots · iOS PWA owner app · cross-shop owner consolidation.',
      'Q1 (next year) — 50 shops · revenue-grade marketplace · header-stripping rechunk for historical logbooks · KV-backed cross-lambda determinism.',
      'Q2 — 100 shops · white-label for one regional MRO franchise · ATA-26 connector for engine telemetry.',
    ],
    theme: 'light',
  },
  {
    n: 13,
    id: 'team',
    label: 'Team',
    eyebrow: '12 · Team',
    title: 'Who\'s building it.',
    bullets: [
      'Andy Patel — Founder & CEO. Pilot, Airbus A330 engineering background, full-stack operator. andy@horf.us.',
      'AI engineering — Claude Code / GPT-4o coding loop running 24/7 on the build. Code quality benchmarked against a 15-SOP standard.',
      'Hiring open: A&P-certified founding mechanic-in-residence; senior staff engineer (multi-tenant systems); GTM lead with GA shop network.',
      'Advisors (open seats): FAA Designated Engineering Representative; SOC2 audit firm partner; type-club industry advisor.',
    ],
    theme: 'light',
  },
  {
    n: 14,
    id: 'ask',
    label: 'The Ask',
    eyebrow: '13 · The ask',
    title: 'Raising $2.5M seed.',
    subtitle: '18 months runway · 50-shop GA milestone · SOC2 Type II audit complete · Marketplace v1 live.',
    metrics: [
      { value: '$2.5M', label: 'Round size' },
      { value: '$15M', label: 'Post-money cap', sub: 'SAFE or priced' },
      { value: '18 mo', label: 'Runway' },
      { value: '50', label: 'Target shops', sub: 'By end of runway' },
    ],
    bullets: [
      'Use of funds: 55% engineering hires (2 senior, 1 founding mechanic-in-residence) · 25% GTM (events, partnerships, content) · 10% SOC2 audit + pen test · 10% reserve.',
      'Lead-investor profile: vertical SaaS, regulated industry experience, $250K-$1M check.',
      'Open to strategic angels: GA owners, type-club presidents, ex-MRO operators.',
    ],
    theme: 'accent',
  },
  {
    n: 15,
    id: 'contact',
    label: 'Contact',
    eyebrow: 'Thank you',
    title: 'Let\'s talk.',
    subtitle: 'andy@horf.us · myaircraft.us · 2026',
    bullets: [
      'Investor Room: /investor-room (this site)',
      'SOP Library: /sop-library — 15 written SOPs, SOC2 matrix, AI Simulator',
      'Public site: myaircraft.us',
    ],
    theme: 'dark',
  },
]
