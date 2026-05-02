'use client'

/**
 * Settings → Integrations
 *
 * Slack / Stripe Connect-style click-to-connect tiles.
 *
 * The page is shared by Owner and Mechanic personas — they see the same
 * directory, plus a "Recommended for owners / mechanics" filter and a
 * persona-aware "Connected" section. Each tile is one of:
 *
 *  - **OAuth provider**     → Connect button kicks off the real OAuth
 *                              redirect (Google Drive, QuickBooks, FreshBooks).
 *  - **Coming soon**        → Provider OAuth is not implemented yet. Button
 *                              is disabled with a clear tooltip. The tile
 *                              still has the official brand logo / copy /
 *                              category so the directory looks polished.
 *
 * No API-key paste fields. Provider credentials (where they exist) are
 * stored server-side after OAuth and never round-tripped to the browser.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  CheckCircle2,
  ExternalLink,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import {
  getIntegrationLogo,
  type IntegrationLogoId,
} from './integrations/logos'

/* ──────────────────────────────────────────────────────────────────────── */
/*  Provider catalogue                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

type Category =
  | 'Storage & Documents'
  | 'Flight Scheduling'
  | 'Live Tracking'
  | 'Maintenance & Data'
  | 'Accounting'

type Persona = 'owner' | 'mechanic' | 'both'

type ConnectMode =
  | { kind: 'oauth'; oauthStartPath: string; statusPath?: string; disconnectPath?: string }
  | { kind: 'coming_soon'; reason: string }

interface ProviderDef {
  id: IntegrationLogoId
  name: string
  tagline: string
  description: string
  category: Category
  persona: Persona
  syncFields: string[]
  websiteUrl: string
  /** True if this provider is one of the headline integrations we feature on top. */
  featured?: boolean
  /** Connection mode — OAuth wiring or "coming soon". */
  connect: ConnectMode
  /** Provider key used by the registry endpoint to flag whether OAuth env vars are set. */
  registryKey?: 'quickbooks' | 'freshbooks' | 'googledrive'
}

const PROVIDERS: ProviderDef[] = [
  /* ──── Storage & Documents ──── */
  {
    id: 'googledrive',
    name: 'Google Drive',
    tagline: 'Import logbook scans and aircraft documents from Drive',
    description:
      'Pull PDF scans of logbooks, ADs, 337s, weight & balance sheets, and other aircraft documents straight from Google Drive. Documents stay in sync — no email attachments, no manual uploads.',
    category: 'Storage & Documents',
    persona: 'both',
    syncFields: ['Logbook PDFs', 'AD compliance docs', 'W&B sheets', 'Aircraft folders'],
    websiteUrl: 'https://www.google.com/drive/',
    featured: true,
    connect: {
      kind: 'oauth',
      oauthStartPath: '/api/gdrive/auth',
      statusPath: '/api/integrations/google-drive',
      disconnectPath: '/api/integrations/google-drive',
    },
    registryKey: 'googledrive',
  },

  /* ──── Accounting ──── */
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    tagline: 'Sync invoices and customers into QuickBooks Online',
    description:
      'Push myaircraft invoices into QuickBooks Online with the customer, aircraft reference, line items, taxes, and totals already filled in. No double entry, no CSV exports.',
    category: 'Accounting',
    persona: 'both',
    syncFields: ['Invoice number', 'Customer', 'Aircraft reference', 'Line items', 'Taxes', 'Totals'],
    websiteUrl: 'https://quickbooks.intuit.com',
    featured: true,
    connect: {
      kind: 'oauth',
      oauthStartPath: '/api/integrations/oauth/start?provider=quickbooks',
    },
    registryKey: 'quickbooks',
  },
  {
    id: 'freshbooks',
    name: 'FreshBooks',
    tagline: 'Send invoices into a lightweight accounting stack',
    description:
      'Connect a FreshBooks account so myaircraft invoices export with customer, line items, totals, memo, and issue date already populated.',
    category: 'Accounting',
    persona: 'both',
    syncFields: ['Invoice number', 'Customer', 'Line items', 'Totals', 'Memo', 'Issue date'],
    websiteUrl: 'https://www.freshbooks.com',
    connect: {
      kind: 'oauth',
      oauthStartPath: '/api/integrations/oauth/start?provider=freshbooks',
    },
    registryKey: 'freshbooks',
  },

  /* ──── Flight Scheduling (Coming Soon) ──── */
  {
    id: 'flightschedulepro',
    name: 'Flight Schedule Pro',
    tagline: 'Scheduling and fleet dispatch for training ops',
    description:
      'Sync aircraft availability, Hobbs/Tach changes, and scheduler-driven maintenance holds so dispatch and records stay aligned.',
    category: 'Flight Scheduling',
    persona: 'owner',
    syncFields: ['Aircraft availability', 'Hobbs / Tach', 'Maintenance holds', 'Fleet status'],
    websiteUrl: 'https://flightschedulepro.com',
    featured: true,
    connect: { kind: 'coming_soon', reason: 'Awaiting Flight Schedule Pro OAuth approval' },
  },
  {
    id: 'flightcircle',
    name: 'Flight Circle',
    tagline: 'Cloud scheduling for school and rental fleets',
    description:
      'Keep your active fleet, maintenance blocks, and utilization totals current between Flight Circle and myaircraft.us.',
    category: 'Flight Scheduling',
    persona: 'owner',
    syncFields: ['Fleet details', 'Hobbs / Tach', 'Aircraft holds'],
    websiteUrl: 'https://flightcircle.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting Flight Circle partner credentials' },
  },
  {
    id: 'schedulemaster',
    name: 'ScheduleMaster',
    tagline: 'Multi-base scheduling and dispatch',
    description:
      'Prepare aircraft, utilization, and maintenance-block data for ScheduleMaster-style scheduler integrations.',
    category: 'Flight Scheduling',
    persona: 'owner',
    syncFields: ['Fleet records', 'Scheduler holds', 'Utilization totals'],
    websiteUrl: 'https://schedulemaster.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting ScheduleMaster partner credentials' },
  },
  {
    id: 'schedaero',
    name: 'Schedaero',
    tagline: 'Charter dispatch with maintenance awareness',
    description:
      'Sync maintenance holds and aircraft readiness so charter schedulers never book unavailable aircraft.',
    category: 'Flight Scheduling',
    persona: 'owner',
    syncFields: ['Aircraft status', 'AOG holds', 'Dispatch availability'],
    websiteUrl: 'https://www.schedaero.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting Schedaero partner credentials' },
  },
  {
    id: 'myflightbook',
    name: 'MyFlightbook',
    tagline: 'Pilot and aircraft activity sync',
    description:
      'Bring aircraft activity and flight-time updates into myaircraft.us to keep records and reminders current.',
    category: 'Flight Scheduling',
    persona: 'owner',
    syncFields: ['Flight time', 'Aircraft activity', 'Utilization history'],
    websiteUrl: 'https://myflightbook.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting MyFlightbook OAuth wiring' },
  },
  {
    id: 'aerocrew',
    name: 'Aero Crew Solutions',
    tagline: 'Crew and operations scheduling',
    description: 'Coordinate crew-facing operations data with aircraft availability and maintenance state.',
    category: 'Flight Scheduling',
    persona: 'owner',
    syncFields: ['Crew schedules', 'Aircraft status', 'Operational readiness'],
    websiteUrl: 'https://aerocrewsolutions.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting Aero Crew Solutions credentials' },
  },
  {
    id: 'fltplan',
    name: 'FltPlan.com',
    tagline: 'Flight planning with utilization context',
    description:
      'Use flight activity and dispatch context to keep Hobbs/Tach usage aligned with aircraft records.',
    category: 'Flight Scheduling',
    persona: 'owner',
    syncFields: ['Flight activity', 'Route utilization', 'Block time context'],
    websiteUrl: 'https://fltplan.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting FltPlan partner credentials' },
  },
  {
    id: 'avplan',
    name: 'AvPlan EFB',
    tagline: 'Electronic flight bag and aircraft activity',
    description: 'Capture block-time and aircraft activity context from AvPlan-connected operations.',
    category: 'Flight Scheduling',
    persona: 'owner',
    syncFields: ['Block times', 'Flight activity', 'Utilization context'],
    websiteUrl: 'https://www.avplan-efb.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting AvPlan partner credentials' },
  },

  /* ──── Live Tracking (Coming Soon) ──── */
  {
    id: 'flightaware',
    name: 'FlightAware AeroAPI',
    tagline: 'Live fleet awareness and activity tracking',
    description: 'Track fleet activity and movement context for aircraft status, utilization, and alerts.',
    category: 'Live Tracking',
    persona: 'owner',
    syncFields: ['Live position', 'Activity status', 'Arrival / departure alerts'],
    websiteUrl: 'https://flightaware.com/aeroapi',
    featured: true,
    connect: { kind: 'coming_soon', reason: 'Awaiting AeroAPI credentials' },
  },
  {
    id: 'adsbexchange',
    name: 'ADS-B Exchange',
    tagline: 'Open ADS-B fleet tracking',
    description: 'Use unfiltered ADS-B tracking signals to enrich aircraft activity views and operational context.',
    category: 'Live Tracking',
    persona: 'owner',
    syncFields: ['Position', 'Altitude', 'Speed', 'Tracking history'],
    websiteUrl: 'https://www.adsbexchange.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting ADS-B Exchange API key' },
  },
  {
    id: 'flightradar',
    name: 'FlightRadar24 Business',
    tagline: 'Global flight-tracking visibility',
    description: 'Feed activity telemetry and fleet playback context into ops and aircraft records views.',
    category: 'Live Tracking',
    persona: 'owner',
    syncFields: ['Live activity', 'Fleet playback', 'Arrival / departure history'],
    websiteUrl: 'https://www.flightradar24.com/commercial-services',
    connect: { kind: 'coming_soon', reason: 'Awaiting FlightRadar24 Business contract' },
  },

  /* ──── Maintenance & Data (Coming Soon) ──── */
  {
    id: 'camp',
    name: 'CAMP Systems',
    tagline: 'Airworthiness and maintenance forecasting',
    description:
      'Bring in maintenance forecasts, due items, and compliance context to keep reminders and ops dashboards current.',
    category: 'Maintenance & Data',
    persona: 'mechanic',
    syncFields: ['Due items', 'Compliance forecasts', 'Maintenance planning'],
    websiteUrl: 'https://www.campsystems.com',
    featured: true,
    connect: { kind: 'coming_soon', reason: 'Awaiting CAMP API partnership' },
  },
  {
    id: 'flightdocs',
    name: 'Flightdocs',
    tagline: 'Maintenance tracking and compliance records',
    description:
      'Normalize customers, aircraft, work orders, squawks, and compliance data from Flightdocs into the myaircraft data model.',
    category: 'Maintenance & Data',
    persona: 'mechanic',
    syncFields: ['Customers', 'Aircraft', 'Work orders', 'Squawks', 'Maintenance history'],
    websiteUrl: 'https://www.flightdocs.com',
    featured: true,
    connect: { kind: 'coming_soon', reason: 'Awaiting Flightdocs API credentials' },
  },
  {
    id: 'traxxall',
    name: 'Traxxall',
    tagline: 'Fleet maintenance management',
    description:
      'Prepare a normalized sync path for aircraft, work orders, discrepancies, and maintenance status from Traxxall.',
    category: 'Maintenance & Data',
    persona: 'mechanic',
    syncFields: ['Aircraft', 'Tasks', 'Work orders', 'Discrepancies', 'Component status'],
    websiteUrl: 'https://www.traxxall.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting Traxxall partnership' },
  },
  {
    id: 'quantum',
    name: 'Quantum Control',
    tagline: 'MRO ERP and shop operations',
    description: 'Support customer, work order, parts, and invoice normalization for repair-station workflows.',
    category: 'Maintenance & Data',
    persona: 'mechanic',
    syncFields: ['Customers', 'Work orders', 'Parts', 'Invoices'],
    websiteUrl: 'https://www.quantum-control.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting Quantum Control API access' },
  },
  {
    id: 'corridor',
    name: 'Corridor',
    tagline: 'CAMO and fleet maintenance oversight',
    description:
      'Import structured maintenance schedules, component life tracking, and work-scope visibility into myaircraft.us.',
    category: 'Maintenance & Data',
    persona: 'mechanic',
    syncFields: ['Aircraft', 'Scheduled tasks', 'Component life', 'Work orders'],
    websiteUrl: 'https://www.rusada.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting Rusada partnership' },
  },
  {
    id: 'atphub',
    name: 'ATP Aviation Hub',
    tagline: 'Technical publications and compliance references',
    description:
      'Connect reference data around manuals, ADs, and service publications to maintenance records and work execution.',
    category: 'Maintenance & Data',
    persona: 'mechanic',
    syncFields: ['Technical references', 'AD / SB context', 'Compliance metadata'],
    websiteUrl: 'https://www.atp.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting ATP Hub API credentials' },
  },
  {
    id: 'winair',
    name: 'WinAir',
    tagline: 'Aviation MRO and inventory management',
    description:
      'Create an extensible sync layer for customers, aircraft, work orders, and inventory-linked maintenance data.',
    category: 'Maintenance & Data',
    persona: 'mechanic',
    syncFields: ['Customers', 'Aircraft', 'Work orders', 'Inventory'],
    websiteUrl: 'https://www.winair.ca',
    connect: { kind: 'coming_soon', reason: 'Awaiting WinAir partnership' },
  },
  {
    id: 'logbookpro',
    name: 'Logbook Pro',
    tagline: 'Electronic flight and maintenance activity',
    description: 'Bring historical activity and airframe time context into the aircraft record timeline.',
    category: 'Maintenance & Data',
    persona: 'owner',
    syncFields: ['Flight history', 'Aircraft times', 'Activity records'],
    websiteUrl: 'https://www.logbookpro.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting Logbook Pro API credentials' },
  },
  {
    id: 'smartaviation',
    name: 'Smart Aviation',
    tagline: 'Maintenance scheduling and compliance tracking',
    description: 'Normalize due items, maintenance tasks, and discrepancy queues for operational review.',
    category: 'Maintenance & Data',
    persona: 'mechanic',
    syncFields: ['Due items', 'Maintenance tasks', 'Squawks', 'Aircraft status'],
    websiteUrl: 'https://smartaviation.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting Smart Aviation partnership' },
  },
  {
    id: 'mxcommander',
    name: 'Mx Commander',
    tagline: 'Mobile-first line maintenance workflows',
    description: 'Prepare field-driven work order, labor, and parts-request synchronization for mechanic operations.',
    category: 'Maintenance & Data',
    persona: 'mechanic',
    syncFields: ['Work orders', 'Labor entries', 'Parts requests', 'Aircraft status'],
    websiteUrl: 'https://mxcommander.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting Mx Commander partnership' },
  },
  {
    id: 'safetyculture',
    name: 'SafetyCulture',
    tagline: 'Digital inspections and audit findings',
    description: 'Move inspection findings and audit evidence into squawk and discrepancy workflows.',
    category: 'Maintenance & Data',
    persona: 'mechanic',
    syncFields: ['Inspection reports', 'Audit findings', 'Compliance issues'],
    websiteUrl: 'https://safetyculture.com',
    connect: { kind: 'coming_soon', reason: 'Awaiting SafetyCulture partnership' },
  },
  {
    id: 'aviobook',
    name: 'AvioBook Maintenance',
    tagline: 'Connected fleet technical log context',
    description: 'Support technical log, deferred item, and fleet maintenance normalization from AvioBook-linked operations.',
    category: 'Maintenance & Data',
    persona: 'mechanic',
    syncFields: ['Tech log entries', 'Deferred items', 'Aircraft activity'],
    websiteUrl: 'https://www.aviobook.aero',
    connect: { kind: 'coming_soon', reason: 'Awaiting AvioBook partnership' },
  },
]

const CATEGORY_PILL: Record<Category, string> = {
  'Storage & Documents': 'bg-violet-50 text-violet-700 border-violet-200',
  'Flight Scheduling': 'bg-blue-50 text-blue-700 border-blue-200',
  'Live Tracking': 'bg-orange-50 text-orange-700 border-orange-200',
  'Maintenance & Data': 'bg-slate-50 text-slate-700 border-slate-200',
  Accounting: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Connection state                                                       */
/* ──────────────────────────────────────────────────────────────────────── */

interface RegistryResponse {
  providers: Record<'quickbooks' | 'freshbooks' | 'googledrive', boolean>
}

interface AccountingIntegrationRow {
  id: string
  provider: string
  status: 'connected' | 'disconnected' | 'error' | 'syncing'
  last_sync_at?: string | null
  last_sync_status?: string | null
  last_sync_error?: string | null
  settings?: Record<string, unknown>
}

interface GDriveStatus {
  connected: boolean
  email?: string | null
  connectedAt?: string | null
}

interface ConnectionState {
  registry: RegistryResponse['providers']
  accounting: Record<string, AccountingIntegrationRow>
  gdrive: GDriveStatus
  loading: boolean
}

const INITIAL_STATE: ConnectionState = {
  registry: { quickbooks: false, freshbooks: false, googledrive: false },
  accounting: {},
  gdrive: { connected: false, email: null, connectedAt: null },
  loading: true,
}

function isProviderConnected(provider: ProviderDef, state: ConnectionState): boolean {
  if (provider.id === 'googledrive') return state.gdrive.connected
  if (provider.id === 'quickbooks') return state.accounting.quickbooks?.status === 'connected'
  if (provider.id === 'freshbooks') return state.accounting.freshbooks?.status === 'connected'
  return false
}

function getConnectionDetail(provider: ProviderDef, state: ConnectionState): string | null {
  if (provider.id === 'googledrive' && state.gdrive.connected) {
    return state.gdrive.email ? `Connected as ${state.gdrive.email}` : 'Connected'
  }
  if (provider.id === 'quickbooks') {
    const row = state.accounting.quickbooks
    if (row?.status === 'connected') {
      const company = (row.settings as any)?.connected_company_name
      return company ? `Connected — ${company}` : 'Connected'
    }
  }
  if (provider.id === 'freshbooks') {
    const row = state.accounting.freshbooks
    if (row?.status === 'connected') {
      const business = (row.settings as any)?.connected_business_name
      return business ? `Connected — ${business}` : 'Connected'
    }
  }
  return null
}

function isOAuthConfigured(provider: ProviderDef, state: ConnectionState): boolean {
  if (provider.connect.kind !== 'oauth') return false
  if (!provider.registryKey) return false
  return Boolean(state.registry[provider.registryKey])
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Reusable bits                                                         */
/* ──────────────────────────────────────────────────────────────────────── */

function timeSince(isoOrDate: string | Date | null | undefined): string | null {
  if (!isoOrDate) return null
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
  if (Number.isNaN(d.getTime())) return null
  const seconds = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function ProviderLogo({
  provider,
  size = 40,
}: {
  provider: ProviderDef
  size?: number
}) {
  const Logo = getIntegrationLogo(provider.id)
  return <Logo size={size} />
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Tile + modal                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

interface ProviderActionState {
  busy: boolean
  error: string | null
  lastInfo: string | null
}

function buildOAuthUrl(provider: ProviderDef): string | null {
  if (provider.connect.kind !== 'oauth') return null
  return provider.connect.oauthStartPath
}

function ProviderTile({
  provider,
  state,
  onOpenInfo,
}: {
  provider: ProviderDef
  state: ConnectionState
  onOpenInfo: (provider: ProviderDef) => void
}) {
  const connected = isProviderConnected(provider, state)
  const detail = getConnectionDetail(provider, state)
  const oauthOk = isOAuthConfigured(provider, state)
  const isOAuth = provider.connect.kind === 'oauth'
  const comingSoon = provider.connect.kind === 'coming_soon' || (isOAuth && !oauthOk)
  const comingSoonReason =
    provider.connect.kind === 'coming_soon'
      ? provider.connect.reason
      : isOAuth && !oauthOk
        ? 'Provider OAuth credentials not configured for this environment'
        : ''

  const oauthUrl = buildOAuthUrl(provider)

  return (
    <div
      className={
        'group flex h-full flex-col rounded-2xl border bg-white p-4 transition-all ' +
        (connected
          ? 'border-emerald-200 shadow-sm'
          : 'border-border hover:border-primary/25 hover:shadow-sm')
      }
    >
      <div className="flex items-start gap-3">
        <ProviderLogo provider={provider} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="truncate text-[14px] text-foreground" style={{ fontWeight: 700 }}>
              {provider.name}
            </span>
            {provider.featured && (
              <span
                className="rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-primary"
                style={{ fontWeight: 700 }}
              >
                Popular
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
            {provider.tagline}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] ${CATEGORY_PILL[provider.category]}`}
          style={{ fontWeight: 700 }}
        >
          {provider.category}
        </span>
        {connected ? (
          <span
            className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700"
            style={{ fontWeight: 700 }}
          >
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Connected
            </span>
          </span>
        ) : comingSoon ? (
          <span
            className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700"
            style={{ fontWeight: 700 }}
          >
            Coming soon
          </span>
        ) : (
          <span
            className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground"
            style={{ fontWeight: 700 }}
          >
            Not connected
          </span>
        )}
      </div>

      <p className="mt-3 line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">
        {detail ?? provider.description}
      </p>

      <div className="mt-auto flex items-center gap-2 pt-4">
        <button
          type="button"
          onClick={() => onOpenInfo(provider)}
          className="flex-1 rounded-xl border border-border px-3 py-2 text-[12px] text-foreground hover:bg-muted/40"
          style={{ fontWeight: 600 }}
        >
          Details
        </button>
        {connected ? (
          <button
            type="button"
            onClick={() => onOpenInfo(provider)}
            className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[12px] text-emerald-700 hover:bg-emerald-50"
            style={{ fontWeight: 600 }}
          >
            Manage
          </button>
        ) : comingSoon ? (
          <button
            type="button"
            disabled
            title={comingSoonReason}
            className="cursor-not-allowed rounded-xl bg-muted px-3 py-2 text-[12px] text-muted-foreground"
            style={{ fontWeight: 600 }}
          >
            Coming soon
          </button>
        ) : oauthUrl ? (
          <a
            href={oauthUrl}
            className="rounded-xl bg-primary px-3 py-2 text-[12px] text-white hover:bg-primary/90"
            style={{ fontWeight: 600 }}
          >
            Connect
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-xl bg-muted px-3 py-2 text-[12px] text-muted-foreground"
            style={{ fontWeight: 600 }}
          >
            Connect
          </button>
        )}
      </div>
    </div>
  )
}

function ProviderInfoModal({
  provider,
  state,
  onClose,
  onDisconnect,
  action,
}: {
  provider: ProviderDef
  state: ConnectionState
  onClose: () => void
  onDisconnect: (provider: ProviderDef) => Promise<void>
  action: ProviderActionState
}) {
  const connected = isProviderConnected(provider, state)
  const detail = getConnectionDetail(provider, state)
  const oauthOk = isOAuthConfigured(provider, state)
  const isOAuth = provider.connect.kind === 'oauth'
  const comingSoon = provider.connect.kind === 'coming_soon' || (isOAuth && !oauthOk)
  const oauthUrl = buildOAuthUrl(provider)

  const lastSyncAt =
    provider.id === 'quickbooks'
      ? state.accounting.quickbooks?.last_sync_at
      : provider.id === 'freshbooks'
        ? state.accounting.freshbooks?.last_sync_at
        : provider.id === 'googledrive'
          ? state.gdrive.connectedAt
          : null

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-border px-6 py-5">
          <ProviderLogo provider={provider} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>
                {provider.name}
              </div>
              {provider.featured && (
                <span
                  className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary"
                  style={{ fontWeight: 700 }}
                >
                  Popular
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">{provider.tagline}</div>
            <span
              className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] ${CATEGORY_PILL[provider.category]}`}
              style={{ fontWeight: 700 }}
            >
              {provider.category}
            </span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-[13px] leading-relaxed text-muted-foreground">{provider.description}</p>

          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
              What this integration handles
            </div>
            <div className="flex flex-wrap gap-1.5">
              {provider.syncFields.map((field) => (
                <span
                  key={field}
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-foreground"
                  style={{ fontWeight: 500 }}
                >
                  {field}
                </span>
              ))}
            </div>
          </div>

          {connected ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-[12px]" style={{ fontWeight: 700 }}>
                  {detail ?? 'Connected'}
                </span>
              </div>
              {lastSyncAt && (
                <div className="mt-1 text-[12px] text-emerald-700">
                  Last activity {timeSince(lastSyncAt) ?? new Date(lastSyncAt).toLocaleString()}
                </div>
              )}
            </div>
          ) : comingSoon ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12px] text-amber-800">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4" />
                <span style={{ fontWeight: 700 }}>Coming soon</span>
              </div>
              <p className="mt-1">
                {provider.connect.kind === 'coming_soon'
                  ? provider.connect.reason
                  : 'Provider OAuth credentials are not configured in this environment yet.'}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-[12px] text-blue-900">
              <div style={{ fontWeight: 700 }}>Secure OAuth connection</div>
              <p className="mt-1 leading-relaxed">
                You will be redirected to {provider.name} to sign in and approve access.
                myaircraft.us stores encrypted refresh / access tokens server-side and never asks anyone to paste a secret.
              </p>
            </div>
          )}

          {action.error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12px] text-red-700">
              {action.error}
            </div>
          )}
          {action.lastInfo && !action.error && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-[12px] text-blue-700">
              {action.lastInfo}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            {connected ? (
              <button
                type="button"
                onClick={() => void onDisconnect(provider)}
                disabled={action.busy}
                className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                style={{ fontWeight: 600 }}
              >
                <Unplug className="w-4 h-4" />
                {action.busy ? 'Disconnecting…' : 'Disconnect'}
              </button>
            ) : comingSoon ? (
              <button
                type="button"
                disabled
                className="flex-1 cursor-not-allowed rounded-xl bg-muted px-4 py-2.5 text-[13px] text-muted-foreground"
                style={{ fontWeight: 600 }}
              >
                Coming soon
              </button>
            ) : oauthUrl ? (
              <a
                href={oauthUrl}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-center text-[13px] text-white hover:bg-primary/90"
                style={{ fontWeight: 600 }}
              >
                Continue to {provider.name}
              </a>
            ) : null}
          </div>

          {provider.websiteUrl && (
            <a
              href={provider.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
              style={{ fontWeight: 600 }}
            >
              Provider website <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Page                                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

export function IntegrationsPage() {
  const searchParams = useSearchParams()
  const [activeCategory, setActiveCategory] = useState<'All' | Category>('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [infoTarget, setInfoTarget] = useState<ProviderDef | null>(null)
  const [state, setState] = useState<ConnectionState>(INITIAL_STATE)
  const [action, setAction] = useState<ProviderActionState>({ busy: false, error: null, lastInfo: null })

  async function reload() {
    setState((prev) => ({ ...prev, loading: true }))
    try {
      const [registryRes, integrationsRes, gdriveRes] = await Promise.all([
        fetch('/api/integrations/registry', { cache: 'no-store' }),
        fetch('/api/integrations', { cache: 'no-store' }),
        fetch('/api/integrations/google-drive', { cache: 'no-store' }),
      ])

      let registry: RegistryResponse['providers'] = INITIAL_STATE.registry
      if (registryRes.ok) {
        const json = (await registryRes.json()) as RegistryResponse
        registry = { ...INITIAL_STATE.registry, ...(json.providers ?? {}) }
      }

      let accounting: Record<string, AccountingIntegrationRow> = {}
      if (integrationsRes.ok) {
        const json = await integrationsRes.json()
        for (const row of json.integrations ?? []) {
          if (row?.provider === 'quickbooks' || row?.provider === 'freshbooks') {
            accounting[row.provider] = row as AccountingIntegrationRow
          }
        }
      }

      let gdrive: GDriveStatus = INITIAL_STATE.gdrive
      if (gdriveRes.ok) {
        const json = await gdriveRes.json()
        gdrive = {
          connected: Boolean(json.connected),
          email: json.email ?? null,
          connectedAt: json.connectedAt ?? null,
        }
      }

      setState({ registry, accounting, gdrive, loading: false })
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false }))
      setAction((prev) => ({ ...prev, error: err instanceof Error ? err.message : 'Failed to load integration status' }))
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDisconnect(provider: ProviderDef) {
    setAction({ busy: true, error: null, lastInfo: null })
    try {
      if (provider.id === 'googledrive') {
        const res = await fetch('/api/integrations/google-drive', { method: 'DELETE' })
        if (!res.ok) throw new Error((await res.json().catch(() => ({ error: 'Disconnect failed' }))).error)
      } else if (provider.id === 'quickbooks' || provider.id === 'freshbooks') {
        const row = state.accounting[provider.id]
        if (!row) throw new Error('Not connected')
        const res = await fetch(`/api/integrations?id=${encodeURIComponent(row.id)}`, { method: 'DELETE' })
        if (!res.ok) throw new Error((await res.json().catch(() => ({ error: 'Disconnect failed' }))).error)
      } else {
        throw new Error('Disconnect is only supported for OAuth integrations')
      }
      await reload()
      setAction({ busy: false, error: null, lastInfo: `${provider.name} disconnected` })
    } catch (err) {
      setAction({ busy: false, error: err instanceof Error ? err.message : 'Disconnect failed', lastInfo: null })
    }
  }

  const callbackProvider = searchParams.get('provider')
  const callbackStatus = searchParams.get('integration_status')
  const callbackReason = searchParams.get('reason')
  const gdriveStatus = searchParams.get('gdrive')

  const categories: Array<'All' | Category> = [
    'All',
    'Storage & Documents',
    'Accounting',
    'Flight Scheduling',
    'Live Tracking',
    'Maintenance & Data',
  ]

  const filteredItems = useMemo(() => {
    let items = activeCategory === 'All' ? PROVIDERS : PROVIDERS.filter((p) => p.category === activeCategory)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      items = items.filter(
        (p) => p.name.toLowerCase().includes(q) || p.tagline.toLowerCase().includes(q)
      )
    }
    // Featured first, then connected, then alphabetical
    return [...items].sort((a, b) => {
      const aConnected = isProviderConnected(a, state) ? 1 : 0
      const bConnected = isProviderConnected(b, state) ? 1 : 0
      if (aConnected !== bConnected) return bConnected - aConnected
      const aFeatured = a.featured ? 1 : 0
      const bFeatured = b.featured ? 1 : 0
      if (aFeatured !== bFeatured) return bFeatured - aFeatured
      return a.name.localeCompare(b.name)
    })
  }, [activeCategory, searchTerm, state])

  const connectedItems = PROVIDERS.filter((p) => isProviderConnected(p, state))
  const liveOAuthCount = PROVIDERS.filter((p) => isOAuthConfigured(p, state)).length

  return (
    <div className="space-y-4">
      {callbackStatus === 'connected' && callbackProvider && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-800">
          {callbackProvider === 'quickbooks'
            ? 'QuickBooks'
            : callbackProvider === 'freshbooks'
              ? 'FreshBooks'
              : callbackProvider}{' '}
          connected. OAuth handshake completed and tokens are stored encrypted.
        </div>
      )}
      {callbackStatus === 'error' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          Integration connection failed{callbackReason ? `: ${decodeURIComponent(callbackReason)}` : '.'}
        </div>
      )}
      {gdriveStatus === 'connected' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-800">
          Google Drive connected. PDF imports are now available from Documents → Upload.
        </div>
      )}
      {gdriveStatus === 'error' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          Google Drive connection failed. Try again, or contact support if the problem persists.
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>
              Integrations
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Click to connect — every live integration uses OAuth, so nobody has to paste API keys or share secrets.
              Tiles marked &ldquo;Coming soon&rdquo; are roadmap items waiting on partner OAuth approval.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 shrink-0">
            <StatTile label="Connected" value={connectedItems.length} tone="text-primary" />
            <StatTile label="OAuth ready" value={liveOAuthCount} tone="text-emerald-600" />
            <StatTile label="Coming soon" value={PROVIDERS.length - liveOAuthCount} tone="text-amber-600" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
        <p className="text-[12px] text-blue-800">
          OAuth tokens are encrypted server-side. We never log secrets or expose them to the browser.
          Disconnecting revokes the stored token and clears the integration record.
        </p>
      </div>

      {connectedItems.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div
            className="text-[10px] uppercase tracking-wider text-emerald-700 mb-2"
            style={{ fontWeight: 700 }}
          >
            Active connections
          </div>
          <div className="flex flex-wrap gap-2">
            {connectedItems.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => setInfoTarget(provider)}
                className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-left hover:border-emerald-300"
              >
                <ProviderLogo provider={provider} size={32} />
                <div>
                  <div className="text-[11px] text-emerald-900" style={{ fontWeight: 700 }}>
                    {provider.name}
                  </div>
                  <div className="text-[10px] text-emerald-700">
                    {getConnectionDetail(provider, state) ?? 'Connected'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search integrations…"
          className="w-full rounded-xl border border-border bg-white pl-9 pr-4 py-2.5 text-[13px] outline-none focus:border-primary/40 placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {categories.map((category) => {
          const count =
            category === 'All' ? PROVIDERS.length : PROVIDERS.filter((p) => p.category === category).length
          const active = activeCategory === category
          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={
                'rounded-xl px-3.5 py-2 text-[12px] transition-colors ' +
                (active
                  ? 'bg-primary text-white'
                  : 'border border-border bg-white text-muted-foreground hover:text-foreground')
              }
              style={{ fontWeight: 600 }}
            >
              {category} <span className={active ? 'text-white/80' : 'text-muted-foreground'}>({count})</span>
            </button>
          )
        })}
      </div>

      {state.loading && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-3 text-[12px] text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Refreshing integration status…
        </div>
      )}

      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white px-6 py-10 text-center text-[13px] text-muted-foreground">
          No integrations match &ldquo;{searchTerm}&rdquo;
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((provider) => (
            <ProviderTile
              key={provider.id}
              provider={provider}
              state={state}
              onOpenInfo={(p) => {
                setAction({ busy: false, error: null, lastInfo: null })
                setInfoTarget(p)
              }}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {infoTarget && (
          <ProviderInfoModal
            provider={infoTarget}
            state={state}
            onClose={() => setInfoTarget(null)}
            onDisconnect={handleDisconnect}
            action={action}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: string
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-center min-w-[102px]">
      <div className={`text-[22px] ${tone}`} style={{ fontWeight: 800 }}>
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}
