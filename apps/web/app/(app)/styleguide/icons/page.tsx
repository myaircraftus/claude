'use client'

/**
 * myaircraft.us — living design-system styleguide
 *
 * A single reference page that renders every piece of the `@/src/design`
 * system: icons, loaders, badges, empty states and color tokens.
 *
 * Access: development only. In production the page renders a "Not available"
 * message instead — there is no client-safe Platform Admin signal on this
 * route (the org role hierarchy tops out at owner/admin and is server-side
 * only), so per the brief `NODE_ENV !== 'production'` is the gate.
 */

import { useCallback, useState } from 'react'
import {
  Icon,
  iconRegistry,
  tokens,
  // loaders
  SpinnerRing,
  SpinnerDots,
  SpinnerPlane,
  SpinnerPulse,
  SkeletonLine,
  SkeletonCard,
  SkeletonTable,
  AILookupLoader,
  UploadProgress,
  PulseLoader,
  SpinLoader,
  // badges
  ConditionBadge,
  ListingStatusBadge,
  VerifiedBadge,
  PlanBadge,
  ConfidenceBadge,
  // empty states
  EmptyMarketplace,
  EmptyMyListings,
  EmptySearch,
  EmptyReviews,
  EmptyDocuments,
  EmptySquawks,
  EmptyWorkOrders,
  EmptyNotifications,
  EmptyActivity,
} from '@/src/design'
import { wideIconRegistry } from '@/src/design/icons/registry'
import type { IconName, WideIconName } from '@/src/design/icons/Icon'
import type { PartCondition } from '@/src/design/components/badges/ConditionBadge'
import type { ListingStatus } from '@/src/design/components/badges/ListingStatusBadge'
import type { ConfidenceLevel } from '@/src/design/components/badges/ConfidenceBadge'
import type { Plan } from '@/src/design/components/badges/PlanBadge'

/* ─── section primitives ─────────────────────────────────────────────────── */

interface SectionProps {
  id: string
  title: string
  description: string
  children: React.ReactNode
}

function Section({ id, title, description, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-8">
      <header className="mb-5 border-b border-slate-200 pb-3">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </header>
      {children}
    </section>
  )
}

/** A labelled tile with a centered preview surface. */
function Tile({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 ${className}`}
    >
      <div className="flex min-h-[64px] w-full items-center justify-center">
        {children}
      </div>
      <span className="text-center text-xs font-medium text-slate-600">
        {label}
      </span>
    </div>
  )
}

/* ─── 1. icons ────────────────────────────────────────────────────────────── */

interface IconCardProps {
  name: string
  wide?: boolean
}

function IconCard({ name, wide = false }: IconCardProps) {
  const [copied, setCopied] = useState(false)

  const snippet = `<Icon name="${name}" />`

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(snippet).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      },
      () => {
        // Clipboard unavailable (insecure context / denied) — fail silently.
        setCopied(false)
      },
    )
  }, [snippet])

  return (
    <div className="group flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-blue-300">
      {/* size comparison: 16 / 20 / 24 */}
      <div className="flex min-h-[40px] items-end gap-3 text-slate-700">
        {wide ? (
          <Icon name={name as WideIconName} size={24} />
        ) : (
          <>
            <Icon name={name as IconName} size={16} />
            <Icon name={name as IconName} size={20} />
            <Icon name={name as IconName} size={24} />
          </>
        )}
      </div>

      <code className="w-full truncate text-center text-[11px] font-medium text-slate-600">
        {name}
      </code>

      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 active:scale-95"
        aria-label={`Copy JSX for ${name} icon`}
      >
        <Icon name={copied ? 'check' : 'copy'} size={12} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function IconsSection() {
  const iconNames = Object.keys(iconRegistry) as IconName[]
  const wideNames = Object.keys(wideIconRegistry) as WideIconName[]

  return (
    <Section
      id="icons"
      title={`Icons (${iconNames.length})`}
      description="Every registered icon, shown at 16 / 20 / 24px. Click Copy to grab the JSX."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {iconNames.map((name) => (
          <IconCard key={name} name={name} />
        ))}
      </div>

      {wideNames.length > 0 && (
        <>
          <h3 className="mb-3 mt-6 text-sm font-semibold text-slate-700">
            Wide icons
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {wideNames.map((name) => (
              <IconCard key={name} name={name} wide />
            ))}
          </div>
        </>
      )}
    </Section>
  )
}

/* ─── 2. loaders ──────────────────────────────────────────────────────────── */

function LoadersSection() {
  return (
    <Section
      id="loaders"
      title="Loaders"
      description="Spinners, skeletons and progress indicators — each rendered once."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <Tile label="SpinnerRing">
          <SpinnerRing />
        </Tile>
        <Tile label="SpinnerDots">
          <SpinnerDots />
        </Tile>
        <Tile label="SpinnerPlane">
          <SpinnerPlane />
        </Tile>
        <Tile label="SpinnerPulse">
          <SpinnerPulse />
        </Tile>
        <Tile label="PulseLoader">
          <PulseLoader />
        </Tile>
        <Tile label="SpinLoader">
          <SpinLoader />
        </Tile>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Tile label="SkeletonLine">
          <div className="w-full">
            <SkeletonLine />
          </div>
        </Tile>
        <Tile label="UploadProgress">
          <UploadProgress percent={62} />
        </Tile>
        <Tile label="SkeletonCard">
          <SkeletonCard />
        </Tile>
        <Tile label="AILookupLoader">
          <AILookupLoader />
        </Tile>
        <Tile label="SkeletonTable" className="md:col-span-2">
          <div className="w-full">
            <SkeletonTable rows={4} />
          </div>
        </Tile>
      </div>
    </Section>
  )
}

/* ─── 3. badges ───────────────────────────────────────────────────────────── */

const CONDITIONS: readonly PartCondition[] = [
  'new',
  'overhauled',
  'serviceable',
  'as-removed',
  'used',
  'for-repair',
]
const LISTING_STATUSES: readonly ListingStatus[] = [
  'active',
  'draft',
  'sold',
  'expired',
]
const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = ['high', 'medium', 'low']
const PLANS: readonly Plan[] = ['starter', 'pro']

/** A labelled row of badge variants. */
function BadgeRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function BadgesSection() {
  return (
    <Section
      id="badges"
      title="Badges"
      description="Every variant of each badge component."
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BadgeRow label="ConditionBadge">
          {CONDITIONS.map((condition) => (
            <ConditionBadge key={condition} condition={condition} />
          ))}
        </BadgeRow>

        <BadgeRow label="ListingStatusBadge">
          {LISTING_STATUSES.map((status) => (
            <ListingStatusBadge key={status} status={status} />
          ))}
        </BadgeRow>

        <BadgeRow label="ConfidenceBadge">
          {CONFIDENCE_LEVELS.map((level) => (
            <ConfidenceBadge key={level} level={level} />
          ))}
        </BadgeRow>

        <BadgeRow label="PlanBadge">
          {PLANS.map((plan) => (
            <PlanBadge key={plan} plan={plan} />
          ))}
        </BadgeRow>

        <BadgeRow label="VerifiedBadge">
          <VerifiedBadge />
        </BadgeRow>
      </div>
    </Section>
  )
}

/* ─── 4. empty states ─────────────────────────────────────────────────────── */

const EMPTY_STATES: readonly { label: string; Component: React.ComponentType }[] =
  [
    { label: 'EmptyMarketplace', Component: EmptyMarketplace },
    { label: 'EmptyMyListings', Component: EmptyMyListings },
    { label: 'EmptySearch', Component: EmptySearch },
    { label: 'EmptyReviews', Component: EmptyReviews },
    { label: 'EmptyDocuments', Component: EmptyDocuments },
    { label: 'EmptySquawks', Component: EmptySquawks },
    { label: 'EmptyWorkOrders', Component: EmptyWorkOrders },
    { label: 'EmptyNotifications', Component: EmptyNotifications },
    { label: 'EmptyActivity', Component: EmptyActivity },
  ]

function EmptyStatesSection() {
  return (
    <Section
      id="empty-states"
      title="Empty states"
      description="Each empty-state component with its default headline and subtext."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EMPTY_STATES.map(({ label, Component }) => (
          <div
            key={label}
            className="flex flex-col rounded-lg border border-slate-200 bg-white"
          >
            <div className="flex flex-1 items-center justify-center p-2">
              <Component />
            </div>
            <code className="border-t border-slate-100 px-4 py-2 text-center text-[11px] font-medium text-slate-500">
              {label}
            </code>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ─── 5. color tokens ─────────────────────────────────────────────────────── */

/** A flat label/value list of brand color tokens, grouped for readability. */
const COLOR_GROUPS: readonly { label: string; keys: readonly string[] }[] = [
  {
    label: 'Surfaces',
    keys: ['bgBase', 'bgSurface', 'bgSubtle', 'bgMuted'],
  },
  {
    label: 'Dark surfaces',
    keys: ['darkBgBase', 'darkBgSurface', 'darkBgSubtle', 'darkBgMuted'],
  },
  {
    label: 'Accent & brand',
    keys: ['accent', 'accentHover', 'accentLight', 'accentDark', 'gold', 'goldLight'],
  },
  {
    label: 'Text',
    keys: ['textPrimary', 'textSecondary', 'textTertiary', 'textInverse'],
  },
  {
    label: 'Status',
    keys: [
      'success',
      'successLight',
      'warning',
      'warningLight',
      'error',
      'errorLight',
      'info',
      'infoLight',
    ],
  },
  {
    label: 'Confidence',
    keys: [
      'confidenceHigh',
      'confidenceMedium',
      'confidenceLow',
      'confidenceInsufficient',
    ],
  },
  {
    label: 'Borders',
    keys: ['border', 'borderStrong', 'borderDark'],
  },
]

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-14 w-full rounded-md border border-slate-200"
        style={{ backgroundColor: value }}
        aria-hidden="true"
      />
      <div className="leading-tight">
        <p className="text-[11px] font-medium text-slate-700">{name}</p>
        <code className="text-[10px] uppercase text-slate-400">{value}</code>
      </div>
    </div>
  )
}

function ColorTokensSection() {
  const palette = tokens.color as Record<string, string>

  return (
    <Section
      id="colors"
      title="Color tokens"
      description="The brand palette exported from the design tokens."
    >
      <div className="flex flex-col gap-6">
        {COLOR_GROUPS.map((group) => (
          <div key={group.label}>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              {group.label}
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {group.keys.map((key) => (
                <Swatch key={key} name={key} value={palette[key] ?? '#000000'} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ─── access gate ─────────────────────────────────────────────────────────── */

/**
 * The styleguide is an internal reference and must not be reachable in
 * production. There is no client-safe Platform Admin signal on this route,
 * so we gate on the build environment per the brief.
 */
const STYLEGUIDE_ENABLED = process.env.NODE_ENV !== 'production'

function NotAvailable() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-lg font-semibold text-slate-900">Not available</h1>
      <p className="mt-1 text-sm text-slate-500">
        The design-system styleguide is only available in development.
      </p>
    </div>
  )
}

/* ─── page ────────────────────────────────────────────────────────────────── */

export default function StyleguideIconsPage() {
  if (!STYLEGUIDE_ENABLED) {
    return <NotAvailable />
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-blue-600">
          <Icon name="brand-logo-mark" size={22} />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Design system
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          myaircraft.us styleguide
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          A living reference for icons, loaders, badges, empty states and color
          tokens. Development only.
        </p>

        <nav className="mt-4 flex flex-wrap gap-2 text-xs">
          {[
            ['Icons', '#icons'],
            ['Loaders', '#loaders'],
            ['Badges', '#badges'],
            ['Empty states', '#empty-states'],
            ['Colors', '#colors'],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-full border border-slate-200 px-3 py-1 font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <div className="flex flex-col gap-12">
        <IconsSection />
        <LoadersSection />
        <BadgesSection />
        <EmptyStatesSection />
        <ColorTokensSection />
      </div>
    </div>
  )
}
