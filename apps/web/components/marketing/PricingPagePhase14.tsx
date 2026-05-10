/**
 * Phase 14 Sprint 14.6 — public per-aircraft pricing page.
 *
 * SERVER component — reads directly from lib/billing/pricing-config.ts so
 * marketing copy stays in sync forever. Pure HTML/Tailwind; no JS dep on
 * the constants beyond the static import.
 *
 * Layout:
 *   Hero
 *   Three columns (Beta / Standard / Pro)
 *   Volume pricing table
 *   Feature comparison grid (focus: processing speed is the only diff)
 *   Add-ons (Expert A&P + Standard QA — "Available v2" badge)
 *   FAQ
 */
import {
  TIER_DEFINITIONS,
  HUMAN_REVIEW_RATES,
  PROCESSING_RULES,
  type TierSlug,
} from '@/lib/billing/pricing-config'
import { CheckCircle2, Clock, Zap, Sparkles } from 'lucide-react'

const TIER_ORDER: TierSlug[] = ['beta', 'standard', 'pro']

const TIER_ICONS: Record<TierSlug, typeof Clock> = {
  beta: Sparkles,
  standard: Clock,
  pro: Zap,
}

const TIER_BLURBS: Record<TierSlug, string> = {
  beta: 'Currently free for everyone. Same processing speed as Pro.',
  standard: 'For shops indexing their archive. Documents searchable next morning.',
  pro: 'For active fleets. Documents searchable in minutes after upload.',
}

export function PricingPagePhase14() {
  return (
    <main className="bg-background text-foreground">
      <Hero />
      <PlanColumns />
      <VolumeTable />
      <FeatureComparison />
      <AddOnsSection />
      <FaqSection />
    </main>
  )
}

// ─── Hero ──────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="border-b bg-gradient-to-b from-blue-50 to-white px-4 py-16">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Aircraft.us pricing — pay per aircraft, no long contracts
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Three tiers. Same features on every paid plan. The only difference is how
          fast your documents become searchable after upload.
        </p>
      </div>
    </section>
  )
}

// ─── Plan columns ──────────────────────────────────────────────────────

function PlanColumns() {
  return (
    <section className="border-b px-4 py-12">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
        {TIER_ORDER.map((slug) => {
          const def = TIER_DEFINITIONS[slug]
          const Icon = TIER_ICONS[slug]
          const headlinePrice = priceHeadline(slug)
          const accent =
            slug === 'beta'
              ? 'border-purple-200 bg-purple-50/40'
              : slug === 'pro'
                ? 'border-emerald-300 bg-emerald-50/30'
                : 'border-blue-200 bg-blue-50/30'
          return (
            <div
              key={slug}
              className={`rounded-xl border-2 ${accent} p-6 ${slug === 'pro' ? 'shadow-lg' : ''}`}
            >
              <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider">
                <Icon className="h-4 w-4" />
                {def.name}
              </div>
              <div className="mt-3 text-4xl font-bold">{headlinePrice}</div>
              {def.priceTiers && (
                <p className="mt-1 text-xs text-muted-foreground">
                  per aircraft / month — volume tiers below
                </p>
              )}
              <p className="mt-4 text-sm">{TIER_BLURBS[slug]}</p>
              <div className="mt-4 rounded-md bg-background/60 p-3 text-sm">
                <div className="font-medium">SLA</div>
                <div className="text-muted-foreground">{def.slaCopy}</div>
              </div>
              <a
                href={slug === 'beta' ? '/onboarding' : '/onboarding'}
                className="mt-6 block rounded-md bg-foreground px-4 py-2 text-center text-sm font-medium text-background hover:opacity-90"
              >
                {slug === 'beta' ? 'Start Beta' : 'Coming v1'}
              </a>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function priceHeadline(slug: TierSlug): string {
  if (slug === 'beta') return 'Free'
  const def = TIER_DEFINITIONS[slug]
  if (def.priceTiers && def.priceTiers.length > 0) {
    return `$${def.priceTiers[0].pricePerAircraft}`
  }
  return def.priceMonthly !== undefined ? `$${def.priceMonthly}` : '—'
}

// ─── Volume table ──────────────────────────────────────────────────────

function VolumeTable() {
  const standardTiers = TIER_DEFINITIONS.standard.priceTiers ?? []
  const proTiers = TIER_DEFINITIONS.pro.priceTiers ?? []
  return (
    <section className="border-b bg-muted/20 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-2xl font-bold">Volume pricing</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Per-aircraft monthly rate drops automatically as your fleet grows.
        </p>
        <div className="mt-6 overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Aircraft</th>
                <th className="px-4 py-2 text-right font-medium">Standard / aircraft / mo</th>
                <th className="px-4 py-2 text-right font-medium">Pro / aircraft / mo</th>
              </tr>
            </thead>
            <tbody>
              {standardTiers.map((std, i) => {
                const pro = proTiers[i]
                const range = std.maxAircraft === null
                  ? `${std.minAircraft}+`
                  : `${std.minAircraft}–${std.maxAircraft}`
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-2">{range}</td>
                    <td className="px-4 py-2 text-right font-mono">${std.pricePerAircraft}</td>
                    <td className="px-4 py-2 text-right font-mono">${pro?.pricePerAircraft ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Pro = Standard + $50 per aircraft, every volume bracket.
        </p>
      </div>
    </section>
  )
}

// ─── Feature comparison ────────────────────────────────────────────────

function FeatureComparison() {
  const features: Array<{ label: string; beta: string; standard: string; pro: string }> = [
    { label: 'AI search across all docs', beta: '✓', standard: '✓', pro: '✓' },
    { label: 'Multi-tenant isolation', beta: '✓', standard: '✓', pro: '✓' },
    { label: 'Logbook + AD compliance tracking', beta: '✓', standard: '✓', pro: '✓' },
    { label: 'Customer approvals portal', beta: '✓', standard: '✓', pro: '✓' },
    {
      label: 'Time to searchable',
      beta: 'real-time',
      standard: '24h batch',
      pro: '5–15 min',
    },
    { label: 'Live indexing progress UI', beta: '✓', standard: '✓', pro: '✓' },
    { label: 'Expert A&P review (optional)', beta: 'v2', standard: 'v2', pro: 'v2' },
  ]
  return (
    <section className="border-b px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-2xl font-bold">All features included on every paid tier</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The only thing you're paying for at higher tiers is processing speed.
        </p>
        <div className="mt-6 overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Feature</th>
                <th className="px-4 py-2 text-center font-medium">Beta</th>
                <th className="px-4 py-2 text-center font-medium">Standard</th>
                <th className="px-4 py-2 text-center font-medium">Pro</th>
              </tr>
            </thead>
            <tbody>
              {features.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <td className="px-4 py-2">{row.label}</td>
                  <td className="px-4 py-2 text-center">{row.beta}</td>
                  <td className="px-4 py-2 text-center">{row.standard}</td>
                  <td className="px-4 py-2 text-center">{row.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

// ─── Add-ons ──────────────────────────────────────────────────────────

function AddOnsSection() {
  return (
    <section className="border-b bg-muted/20 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Add-ons</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            Available v2
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Optional human review for handwritten content. We show an estimate before any work
          begins; you decide whether to accept.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {(Object.values(HUMAN_REVIEW_RATES) as Array<typeof HUMAN_REVIEW_RATES[keyof typeof HUMAN_REVIEW_RATES]>).map((r) => (
            <div key={r.key} className="rounded-md border bg-background p-4">
              <div className="text-sm font-semibold">{r.name}</div>
              <div className="mt-1 text-2xl font-bold">${r.hourlyRate}/hr</div>
              <p className="mt-2 text-xs text-muted-foreground">{r.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── FAQ ──────────────────────────────────────────────────────────────

function FaqSection() {
  const faqs: Array<{ q: string; a: string }> = [
    {
      q: 'How does processing work?',
      a: 'Upload a PDF or photo. We OCR + index it. On Pro, that takes 5–15 minutes; on Standard, the next 02:00 UTC batch (typically by 06:00 in your time zone). You see live progress in the document detail page either way.',
    },
    {
      q: 'What if a doc needs human review?',
      a: 'We auto-detect handwritten content during upload. If a doc has more than 30% handwriting, we offer Expert A&P Verification ($150/hr) or Standard QA Review ($50/hr) with a cost estimate. You can also skip review entirely. (Workflow lives in the app today; charging turns on in v2.)',
    },
    {
      q: `What if I have a 500-page logbook?`,
      a: `Documents over ${PROCESSING_RULES.largeDocPageThreshold} pages always process in batch overnight, regardless of tier. We make this clear before upload — large docs are ready by 06:00 the next morning.`,
    },
    {
      q: 'Can I switch tiers?',
      a: 'Yes. From your /admin/billing/orgs page (or by emailing support), tier changes take effect immediately. We pro-rate any difference.',
    },
    {
      q: 'When am I charged?',
      a: 'Beta: never. Standard/Pro: monthly, in arrears. The bill is # of aircraft × per-aircraft rate at the volume bracket you fall into.',
    },
  ]
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-bold">Frequently asked</h2>
        <div className="mt-6 space-y-4">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="rounded-md border bg-background p-4 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="cursor-pointer text-sm font-medium">{f.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
